import UIKit
import Capacitor

/// Contrôleur principal : la vue web de Capacitor, plus les modules natifs propres à l'appli.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthSyncPlugin())
    }
}
