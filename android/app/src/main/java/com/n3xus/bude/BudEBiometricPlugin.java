package com.n3xus.bude;

import android.content.Context;
import android.content.pm.PackageManager;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge for Bud-E's app lock: the phone's own fingerprint /
 * face unlock (Android BiometricPrompt) plus a shared "is the app
 * currently locked" flag so the bubble and the voice session stay shut
 * while the lock is on. The PIN itself lives in the web app (a salted
 * hash in localStorage) — this plugin only handles the biometric half
 * and publishes the locked flag.
 *
 * The BiometricPrompt must run on the main thread; the authenticate
 * call is held open until the prompt answers (success, cancel, or
 * "Use PIN instead" all resolve { success: false } except a real
 * unlock, which resolves { success: true }).
 */
@CapacitorPlugin(name = "BudEBiometric")
public class BudEBiometricPlugin extends Plugin {

    /** SharedPreferences holding the locked flag for the native side. */
    public static final String PREFS = "bude-lock";
    private static final String KEY_LOCKED = "locked";

    private PluginCall pendingAuthCall;

    /** Is the app currently locked? Read by the bubble and voice session. */
    public static boolean isLocked(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_LOCKED, false);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        Context context = getContext();
        BiometricManager manager = BiometricManager.from(context);
        int result = manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        boolean available = result == BiometricManager.BIOMETRIC_SUCCESS;
        String reason;
        if (available) {
            reason = "ok";
        } else if (result == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
            reason = "no_hardware";
        } else if (result == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            reason = "none_enrolled";
        } else {
            reason = "unavailable";
        }
        String type = "none";
        if (available) {
            PackageManager pm = context.getPackageManager();
            if (pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT)) {
                type = "fingerprint";
            } else if (pm.hasSystemFeature(PackageManager.FEATURE_FACE)) {
                type = "face";
            }
        }
        JSObject res = new JSObject();
        res.put("available", available);
        res.put("type", type);
        res.put("reason", reason);
        call.resolve(res);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        if (pendingAuthCall != null) {
            call.reject("already_authenticating");
            return;
        }
        FragmentActivity activity = getActivity() instanceof FragmentActivity
                ? (FragmentActivity) getActivity()
                : null;
        if (activity == null) {
            call.resolve(new JSObject().put("success", false));
            return;
        }
        pendingAuthCall = call;
        String title = call.getString("title", "Unlock Bud-E");
        String subtitle = call.getString("subtitle", "Use your fingerprint or face to open the app");
        activity.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setNegativeButtonText("Use PIN instead")
                    .build();
            BiometricPrompt prompt = new BiometricPrompt(
                    activity,
                    ContextCompat.getMainExecutor(activity),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            PluginCall pending = pendingAuthCall;
                            pendingAuthCall = null;
                            if (pending != null) {
                                pending.resolve(new JSObject().put("success", true));
                            }
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, CharSequence errString) {
                            // Cancelled, "Use PIN instead", lockout, or a
                            // hardware error — all just mean "not unlocked".
                            PluginCall pending = pendingAuthCall;
                            pendingAuthCall = null;
                            if (pending != null) {
                                pending.resolve(new JSObject().put("success", false));
                            }
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // Wrong finger/face — the prompt stays up so the
                            // user can try again. Nothing to resolve yet.
                        }
                    });
            prompt.authenticate(promptInfo);
        });
    }

    @PluginMethod
    public void publishLockState(PluginCall call) {
        boolean locked = call.getBoolean("locked", false);
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_LOCKED, locked)
                .apply();
        call.resolve();
    }
}
