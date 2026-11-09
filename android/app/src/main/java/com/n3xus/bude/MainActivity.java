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
        // Shortcuts, the widget, and shares from other apps arrive as the
        // launch intent — stash what they asked for so the web app can
        // pick it up, and keep the Talk notification showing.
        handleTalkRequest(getIntent());
        BudELaunchInfo.capture(this, getIntent());
        BudENotification.showIfEnabled(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleTalkRequest(intent);
        BudELaunchInfo.capture(this, intent);
    }

    /**
     * "Talk" from the widget, notification, or shortcut: open the voice
     * session if Bud-E is the default assistant (the same overlay the
     * power-button long-press opens). A plain ACTION_ASSIST intent cannot
     * do that — it just resolves to an app — so Talk comes here instead.
     * When there is no live assistant service, fall back to the chat tab
     * so Talk still lands somewhere useful.
     */
    private void handleTalkRequest(Intent intent) {
        if (intent == null) return;
        boolean talk = intent.getBooleanExtra("bude_talk", false)
                || "true".equals(intent.getStringExtra("bude_talk"));
        if (!talk) return;
        intent.removeExtra("bude_talk");
        if (BudEInteractionService.showVoiceSession()) return;
        intent.putExtra(BudELaunchInfo.EXTRA_TAB, "chat");
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
