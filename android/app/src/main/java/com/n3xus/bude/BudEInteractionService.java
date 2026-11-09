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

    /** The live service, when Android has it running (Bud-E is the
     *  default assistant). Null otherwise — e.g. right after a reboot
     *  before the system has bound it. */
    private static BudEInteractionService instance;

    @Override
    public void onReady() {
        super.onReady();
        instance = this;
        Log.i(TAG, "Bud-E assistant service ready");
    }

    @Override
    public void onShutdown() {
        instance = null;
        super.onShutdown();
        Log.i(TAG, "Bud-E assistant service shutting down");
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    /**
     * Ask the system to show Bud-E's voice session — the overlay that
     * listens (the same one the power-button long-press opens). Only works
     * when this service is running, i.e. Bud-E is the phone's default
     * assistant. A plain ACTION_ASSIST intent cannot open the session (it
     * just resolves to an app), which is why Talk goes through here.
     * Returns false when there is no live service to ask, so the caller
     * can fall back to opening the app instead.
     */
    public static boolean showVoiceSession() {
        BudEInteractionService service = instance;
        if (service == null) return false;
        try {
            // Flag 1 = SHOW_WITH_ASSIST (opened the way the power-button
            // long-press opens it). The constant is hidden from the public
            // SDK, so the value is written out — it is stable AOSP API.
            service.showSession(new android.os.Bundle(), 1);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "showSession failed", e);
            return false;
        }
    }
}
