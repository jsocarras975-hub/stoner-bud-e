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
        registerPlugin(BudEBiometricPlugin.class);
        registerPlugin(BudEKeyboardPlugin.class);
        super.onCreate(savedInstanceState);
        // The music widget's play button resumes playback by launching the
        // app — that play() call comes from the launch flow, not from a tap
        // inside the WebView, so the WebView must not demand a user gesture
        // for media. The app only plays audio through the music player
        // (voice replies use Android TTS, not the WebView), so this only
        // affects the music controls.
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
            }
        } catch (Exception ignored) {
            // The WebView setting is best-effort — the play button in the
            // app still works, and the widget falls back to opening Music.
        }
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
     * "Talk" from the notification: open the voice session if Bud-E is the
     * default assistant (a plain ACTION_ASSIST intent cannot do that — it
     * just resolves to an app — so Talk comes here instead). When there is
     * no live assistant service, fall back to the chat tab so Talk still
     * lands somewhere useful. The widget Talk button and the power-button
     * long-press open the bubble chat directly now, without coming here.
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
