package com.n3xus.bude;

import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local native plugins must be registered before the bridge loads.
        registerPlugin(BudEActionsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        runPendingDeviceAction();
    }

    /** The voice session cannot start clock/calendar intents itself (both
     *  startAssistantActivity and a plain start throw a SecurityException
     *  for them), so it hands the action to the app: fire it here, from the
     *  foreground, and toast the result. The extra is cleared first so it
     *  only runs once, even if the activity resumes again. */
    private void runPendingDeviceAction() {
        Intent intent = getIntent();
        if (intent == null) return;
        String raw = intent.getStringExtra(BudEActions.EXTRA_DEVICE_ACTION);
        if (raw == null || raw.isEmpty()) return;
        intent.removeExtra(BudEActions.EXTRA_DEVICE_ACTION);
        try {
            BudEActions.Result result = BudEActions.execute(this, new JSONObject(raw));
            Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            android.util.Log.e("BudEActions", "relay action failed", e);
        }
    }
}
