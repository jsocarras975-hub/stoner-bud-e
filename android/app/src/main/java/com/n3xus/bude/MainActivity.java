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
        handleBubbleChatRequest(getIntent());
        BudELaunchInfo.capture(this, getIntent());
        BudENotification.showIfEnabled(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleTalkRequest(intent);
        handleBubbleChatRequest(intent);
        BudELaunchInfo.capture(this, intent);
    }

    /**
     * "Talk" from the notification: open the voice session if Bud-E is the
     * default assistant (a plain ACTION_ASSIST intent cannot do that — it
     * just resolves to an app — so Talk comes here instead). When there is
     * no live assistant service, fall back to the chat tab so Talk still
     * lands somewhere useful. The widget Talk button no longer comes here:
     * it opens the bubble chat instead (see handleBubbleChatRequest).
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

    /**
     * "Talk" from the widget, or the power-button long-press (via the
     * voice session, which hands off here): open the bubble chat panel.
     * Tapping Talk turns the bubble on — the panel opens over the app.
     * When the phone has not allowed Bud-E to draw over other apps, the
     * bubble cannot appear, so it falls back to the chat tab and says why.
     */
    private void handleBubbleChatRequest(Intent intent) {
        if (intent == null) return;
        boolean bubbleChat = intent.getBooleanExtra("bude_bubble_chat", false)
                || "true".equals(intent.getStringExtra("bude_bubble_chat"));
        if (!bubbleChat) return;
        intent.removeExtra("bude_bubble_chat");
        if (!android.provider.Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Allow Bud-E to draw over other apps to use the bubble chat — it's in Settings, under Phone.", Toast.LENGTH_LONG).show();
            intent.putExtra(BudELaunchInfo.EXTRA_TAB, "chat");
            return;
        }
        BudEBubbleService.setEnabled(this, true);
        BudEBubbleService.startWithAction(this, BudEBubbleService.ACTION_EXPAND_CHAT);
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
