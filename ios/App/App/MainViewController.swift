import UIKit
import Capacitor

/// Contrôleur principal : la vue web de Capacitor, plus les modules natifs propres à l'appli.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthSyncPlugin())
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        guard let scroll = webView?.scrollView else { return }
        // La page dessine elle-même ses bords (barre du haut, fondu sous les onglets) :
        // pas de rebond élastique, qui faisait remonter la barre d'onglets en bas de page…
        scroll.bounces = false
        scroll.alwaysBounceVertical = false
        #if compiler(>=6.2)
        // … ni du voile flou qu'iOS 26 ajoute sous la barre d'état et en bas de l'écran.
        if #available(iOS 26.0, *) {
            scroll.topEdgeEffect.isHidden = true
            scroll.bottomEdgeEffect.isHidden = true
        }
        #endif
    }
}
