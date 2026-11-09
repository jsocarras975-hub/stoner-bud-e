package com.n3xus.bude;

import android.service.voice.VoiceInteractionService;
import android.util.Log;

/**
 * Stoner Bud-E — the always-running assistant service.
 *
 * When the user picks Bud-E as the phone's digital assistant, Android keeps
 * this service running so it can be invoked (long-press home / corner swipe).
 * This class stays deliberately light: every assist session — UI, listening,
 * chat, speaking — runs in BudESession, created by BudESessionService, which
 * Android finds through the android.voice_interaction meta-data in the
 * manifest. Nothing here touches the network or the microphone.
 */
public class BudEInteractionService extends VoiceInteractionService {
    private static final String TAG = "BudEAssistant";

    @Override
    public void onReady() {
        super.onReady();
        Log.i(TAG, "Bud-E assistant service ready");
    }

    @Override
    public void onShutdown() {
        super.onShutdown();
        Log.i(TAG, "Bud-E assistant service shutting down");
    }
}
