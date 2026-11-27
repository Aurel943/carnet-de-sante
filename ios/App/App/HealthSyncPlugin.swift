import Foundation
import Capacitor
import HealthKit

/// Lecture directe d'Apple Santé (HealthKit) pour Arden.
///
/// Côté JavaScript : `HealthSync.isAvailable()`, `HealthSync.requestAuthorization()`
/// et `HealthSync.query({ start, end })` (secondes depuis 1970).
/// `query` renvoie les mesures brutes de la période, dans les unités attendues par
/// l'analyseur de l'appli (src/healthkit.js les convertit au format de l'export Apple Santé) :
///
///     {
///       src: [noms des sources],
///       q:   { StepCount: { s: [début], d: [durée], v: [valeur], o: [index source] }, … },
///       hr:  { s: [début de minute], v: [FC moyenne de la minute] },
///       c:   { Sleep: { s, d, v: [code], o }, Mind: { s, d, v, o } },
///       w:   [ { ty, s, d, kcal, km, hr, mx, o } ]
///     }
///
/// Pendant une séance : `HealthSync.startLive({ since })` ouvre une requête qu'Apple Santé alimente toute seule
/// dès qu'une mesure arrive sur l'iPhone (fréquence cardiaque, calories actives) : pas de relecture en boucle.
/// Chaque arrivée est envoyée à l'appli par l'événement `live` : `{ k: "hr" | "kcal", samples: [{ t, e, v }] }`
/// (début et fin en secondes depuis 1970, valeur en bpm ou en kcal). `HealthSync.stopLive()` la referme.
///
/// L'appli ne fait que lire : rien n'est écrit dans Apple Santé.
@objc(HealthSyncPlugin)
public class HealthSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthSyncPlugin"
    public let jsName = "HealthSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "query", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startLive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopLive", returnType: CAPPluginReturnPromise)
    ]

    /// Requêtes ouvertes pendant une séance (fermées par stopLive, ou à la séance suivante)
    private var liveQueries: [HKQuery] = []

    private let store = HKHealthStore()
    private let bpm = HKUnit.count().unitDivided(by: HKUnit.minute())

    /// Mesures lues : identifiant HealthKit, nom utilisé dans l'export Apple, unité attendue.
    private lazy var quantities: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
        (.stepCount, "StepCount", .count()),
        (.activeEnergyBurned, "ActiveEnergyBurned", .kilocalorie()),
        (.basalEnergyBurned, "BasalEnergyBurned", .kilocalorie()),
        (.appleExerciseTime, "AppleExerciseTime", .minute()),
        (.distanceWalkingRunning, "DistanceWalkingRunning", .meterUnit(with: .kilo)),
        (.flightsClimbed, "FlightsClimbed", .count()),
        (.appleStandTime, "AppleStandTime", .minute()),
        (.dietaryWater, "DietaryWater", .literUnit(with: .milli)),
        (.restingHeartRate, "RestingHeartRate", bpm),
        (.walkingHeartRateAverage, "WalkingHeartRateAverage", bpm),
        (.heartRateRecoveryOneMinute, "HeartRateRecoveryOneMinute", bpm),
        (.heartRateVariabilitySDNN, "HeartRateVariabilitySDNN", .secondUnit(with: .milli)),
        (.respiratoryRate, "RespiratoryRate", bpm),
        (.oxygenSaturation, "OxygenSaturation", .percent()),
        (.appleSleepingWristTemperature, "AppleSleepingWristTemperature", .degreeCelsius()),
        (.vo2Max, "VO2Max", HKUnit(from: "ml/kg*min")),
        (.bodyMass, "BodyMass", .gramUnit(with: .kilo)),
        (.bodyFatPercentage, "BodyFatPercentage", .percent())
    ]

    private var readTypes: Set<HKObjectType> {
        var set = Set<HKObjectType>()
        for (id, _, _) in quantities {
            if let t = HKObjectType.quantityType(forIdentifier: id) { set.insert(t) }
        }
        if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) { set.insert(hr) }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { set.insert(sleep) }
        if let mind = HKObjectType.categoryType(forIdentifier: .mindfulSession) { set.insert(mind) }
        set.insert(HKObjectType.workoutType())
        return set
    }

    // MARK: - Méthodes exposées

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Santé n'est pas disponible sur cet appareil.")
            return
        }
        store.requestAuthorization(toShare: nil, read: readTypes) { ok, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            // iOS ne dit jamais si la lecture a été refusée : sans autorisation, les requêtes reviennent vides.
            call.resolve(["shown": ok])
        }
    }

    @objc func query(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Santé n'est pas disponible sur cet appareil.")
            return
        }
        guard let startS = call.getDouble("start"), let endS = call.getDouble("end"), endS > startS else {
            call.reject("Période invalide.")
            return
        }
        let start = Date(timeIntervalSince1970: startS)
        let end = Date(timeIntervalSince1970: endS)
        // Chaque mesure appartient à la période où elle commence : les périodes successives ne se recoupent pas.
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        let lock = DispatchQueue(label: "carnet.healthsync")
        let group = DispatchGroup()
        var sources: [String] = []
        var sourceIndex: [String: Int] = [:]
        var q: [String: Any] = [:]
        var c: [String: Any] = [:]
        var hr: [String: Any] = ["s": [Int](), "v": [Double]()]
        var workouts: [[String: Any]] = []
        var firstError: String?

        // À appeler depuis `lock` uniquement
        func src(_ sample: HKSample) -> Int {
            let name = sample.sourceRevision.source.name
            if let i = sourceIndex[name] { return i }
            sources.append(name)
            sourceIndex[name] = sources.count - 1
            return sources.count - 1
        }
        func fail(_ error: Error?) {
            guard let error = error else { return }
            let e = error as NSError
            // « Aucune donnée » ou autorisation refusée pour un type : on ignore, les autres types suivent.
            if e.domain == HKErrorDomain && (e.code == HKError.Code.errorNoData.rawValue || e.code == HKError.Code.errorAuthorizationDenied.rawValue) { return }
            if firstError == nil { firstError = error.localizedDescription }
        }

        // Mesures quantitatives (pas, énergie, VFC, poids…)
        for (id, name, unit) in quantities {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { continue }
            group.enter()
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit,
                                      sortDescriptors: nil) { _, samples, error in
                lock.async {
                    defer { group.leave() }
                    fail(error)
                    guard let samples = samples as? [HKQuantitySample], !samples.isEmpty else { return }
                    var s = [Int](), d = [Int](), v = [Double](), o = [Int]()
                    s.reserveCapacity(samples.count); d.reserveCapacity(samples.count)
                    v.reserveCapacity(samples.count); o.reserveCapacity(samples.count)
                    for x in samples {
                        guard x.quantity.is(compatibleWith: unit) else { continue }
                        s.append(Int(x.startDate.timeIntervalSince1970))
                        d.append(Int(x.endDate.timeIntervalSince(x.startDate)))
                        v.append((x.quantity.doubleValue(for: unit) * 1000).rounded() / 1000)
                        o.append(src(x))
                    }
                    q[name] = ["s": s, "d": d, "v": v, "o": o]
                }
            }
            store.execute(query)
        }

        // Fréquence cardiaque : moyenne minute par minute (toutes sources confondues)
        if let hrType = HKObjectType.quantityType(forIdentifier: .heartRate) {
            group.enter()
            var interval = DateComponents()
            interval.minute = 1
            let query = HKStatisticsCollectionQuery(quantityType: hrType, quantitySamplePredicate: predicate,
                                                    options: .discreteAverage,
                                                    anchorDate: Calendar.current.startOfDay(for: start),
                                                    intervalComponents: interval)
            query.initialResultsHandler = { [bpm] _, results, error in
                var s = [Int](), v = [Double]()
                results?.enumerateStatistics(from: start, to: end) { stat, _ in
                    if let avg = stat.averageQuantity()?.doubleValue(for: bpm) {
                        s.append(Int(stat.startDate.timeIntervalSince1970))
                        v.append((avg * 10).rounded() / 10)
                    }
                }
                lock.async {
                    defer { group.leave() }
                    fail(error)
                    hr = ["s": s, "v": v]
                }
            }
            store.execute(query)
        }

        // Sommeil (phases) et pleine conscience
        let categories: [(HKCategoryTypeIdentifier, String)] = [(.sleepAnalysis, "Sleep"), (.mindfulSession, "Mind")]
        for (id, name) in categories {
            guard let type = HKObjectType.categoryType(forIdentifier: id) else { continue }
            group.enter()
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit,
                                      sortDescriptors: nil) { _, samples, error in
                lock.async {
                    defer { group.leave() }
                    fail(error)
                    guard let samples = samples as? [HKCategorySample], !samples.isEmpty else { return }
                    var s = [Int](), d = [Int](), v = [Int](), o = [Int]()
                    for x in samples {
                        s.append(Int(x.startDate.timeIntervalSince1970))
                        d.append(Int(x.endDate.timeIntervalSince(x.startDate)))
                        v.append(x.value)
                        o.append(src(x))
                    }
                    c[name] = ["s": s, "d": d, "v": v, "o": o]
                }
            }
            store.execute(query)
        }

        // Entraînements
        group.enter()
        let wq = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit,
                               sortDescriptors: nil) { [weak self] _, samples, error in
            guard let self = self else { group.leave(); return }
            var list: [(HKWorkout, [String: Any])] = []
            for w in (samples as? [HKWorkout]) ?? [] {
                var o: [String: Any] = [
                    "ty": self.activityName(w.workoutActivityType),
                    "s": Int(w.startDate.timeIntervalSince1970),
                    "d": Int(w.duration)
                ]
                if let kcal = self.sum(w, .activeEnergyBurned, .kilocalorie()) { o["kcal"] = Int(kcal.rounded()) }
                for dist in [HKQuantityTypeIdentifier.distanceWalkingRunning, .distanceCycling, .distanceSwimming] {
                    if let km = self.sum(w, dist, .meterUnit(with: .kilo)), km > 0 {
                        o["km"] = (km * 100).rounded() / 100
                        break
                    }
                }
                if let hrType = HKObjectType.quantityType(forIdentifier: .heartRate), let st = w.statistics(for: hrType) {
                    if let a = st.averageQuantity()?.doubleValue(for: self.bpm) { o["hr"] = Int(a.rounded()) }
                    if let m = st.maximumQuantity()?.doubleValue(for: self.bpm) { o["mx"] = Int(m.rounded()) }
                }
                list.append((w, o))
            }
            lock.async {
                defer { group.leave() }
                fail(error)
                for (w, var o) in list {
                    o["o"] = src(w)
                    workouts.append(o)
                }
            }
        }
        store.execute(wq)

        group.notify(queue: lock) {
            if let err = firstError, q.isEmpty, c.isEmpty, workouts.isEmpty, (hr["s"] as? [Int])?.isEmpty ?? true {
                call.reject(err)
                return
            }
            call.resolve(["src": sources, "q": q, "hr": hr, "c": c, "w": workouts])
        }
    }

    // MARK: - En direct pendant une séance

    @objc func startLive(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Santé n'est pas disponible sur cet appareil.")
            return
        }
        stopLiveQueries()
        let sinceS = call.getDouble("since") ?? Date().addingTimeInterval(-600).timeIntervalSince1970
        let predicate = HKQuery.predicateForSamples(withStart: Date(timeIntervalSince1970: sinceS), end: nil, options: .strictStartDate)
        let kinds: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
            (.heartRate, "hr", bpm),
            (.activeEnergyBurned, "kcal", .kilocalorie())
        ]
        for (id, key, unit) in kinds {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { continue }
            // Même traitement pour la première réponse et pour chaque arrivée suivante
            let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = { [weak self] _, samples, _, _, _ in
                guard let self = self, let samples = samples as? [HKQuantitySample], !samples.isEmpty else { return }
                let list: [[String: Any]] = samples.compactMap { (x: HKQuantitySample) -> [String: Any]? in
                    guard x.quantity.is(compatibleWith: unit) else { return nil }
                    return ["t": x.startDate.timeIntervalSince1970, "e": x.endDate.timeIntervalSince1970,
                            "v": (x.quantity.doubleValue(for: unit) * 10).rounded() / 10]
                }
                if list.isEmpty { return }
                self.notifyListeners("live", data: ["k": key, "samples": list])
            }
            let query = HKAnchoredObjectQuery(type: type, predicate: predicate, anchor: nil,
                                              limit: HKObjectQueryNoLimit, resultsHandler: handler)
            query.updateHandler = handler
            store.execute(query)
            liveQueries.append(query)
        }
        call.resolve()
    }

    @objc func stopLive(_ call: CAPPluginCall) {
        stopLiveQueries()
        call.resolve()
    }

    private func stopLiveQueries() {
        for q in liveQueries { store.stop(q) }
        liveQueries.removeAll()
    }

    // MARK: - Outils

    private func sum(_ w: HKWorkout, _ id: HKQuantityTypeIdentifier, _ unit: HKUnit) -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return nil }
        return w.statistics(for: type)?.sumQuantity()?.doubleValue(for: unit)
    }

    /// Nom du type d'entraînement tel qu'il apparaît dans l'export Apple (« HKWorkoutActivityTypeRunning »).
    private func activityName(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .traditionalStrengthTraining: return "TraditionalStrengthTraining"
        case .functionalStrengthTraining: return "FunctionalStrengthTraining"
        case .running: return "Running"
        case .walking: return "Walking"
        case .cycling: return "Cycling"
        case .highIntensityIntervalTraining: return "HighIntensityIntervalTraining"
        case .swimming: return "Swimming"
        case .elliptical: return "Elliptical"
        case .rowing: return "Rowing"
        case .coreTraining: return "CoreTraining"
        case .yoga: return "Yoga"
        case .pilates: return "Pilates"
        case .hiking: return "Hiking"
        case .stairClimbing: return "StairClimbing"
        case .crossTraining: return "CrossTraining"
        case .mixedCardio: return "MixedCardio"
        case .soccer: return "Soccer"
        case .basketball: return "Basketball"
        case .tennis: return "Tennis"
        case .boxing: return "Boxing"
        case .martialArts: return "MartialArts"
        case .climbing: return "Climbing"
        case .flexibility: return "Flexibility"
        case .cooldown: return "Cooldown"
        default: return "Other"
        }
    }
}
