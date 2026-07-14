package com.ff.ainutritracker;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import com.google.firebase.analytics.FirebaseAnalytics;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private FirebaseAnalytics mFirebaseAnalytics;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Inizializza Firebase Analytics
        mFirebaseAnalytics = FirebaseAnalytics.getInstance(this);

        // Collega l'interfaccia JavaScript AndroidAnalytics alla WebView di Capacitor
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void logPremiumClick(String featureName) {
                    Bundle bundle = new Bundle();
                    bundle.putString("feature_name", featureName);
                    mFirebaseAnalytics.logEvent("click_premium_interest", bundle);
                }
            }, "AndroidAnalytics");
        }
    }
}
