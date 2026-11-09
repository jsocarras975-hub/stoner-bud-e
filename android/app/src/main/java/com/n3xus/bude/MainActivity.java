package com.n3xus.bude;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local native plugins must be registered before the bridge loads.
        registerPlugin(BudEActionsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
