package com.n3xus.bude;

import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Capacitor bridge for the Bud-E Keyboard (see BudEKeyboardService). The
 * web Settings tab uses it to show whether the keyboard is enabled and
 * current, and to open the system screens that turn it on — Android makes
 * the user pick the keyboard in Settings, an app can never set itself.
 */
@CapacitorPlugin(name = "BudEKeyboard")
public class BudEKeyboardPlugin extends Plugin {

    private static final String KEYBOARD_ID = "com.n3xus.bude/.BudEKeyboardService";

    /** Whether Bud-E Keyboard is turned on in the system keyboard list. */
    @PluginMethod
    public void isKeyboardEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", isEnabled());
        call.resolve(result);
    }

    /** Whether Bud-E Keyboard is the keyboard currently in use. */
    @PluginMethod
    public void isKeyboardActive(PluginCall call) {
        JSObject result = new JSObject();
        result.put("active", isActive());
        call.resolve(result);
    }

    /** Open the system keyboard settings (where the user enables it). */
    @PluginMethod
    public void openKeyboardSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** Show the system keyboard picker (where the user switches to it). */
    @PluginMethod
    public void showKeyboardPicker(PluginCall call) {
        InputMethodManager imm = (InputMethodManager) getContext()
                .getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.showInputMethodPicker();
        call.resolve();
    }

    private boolean isEnabled() {
        InputMethodManager imm = (InputMethodManager) getContext()
                .getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm == null) return false;
        List<InputMethodInfo> enabled = imm.getEnabledInputMethodList();
        for (InputMethodInfo info : enabled) {
            if (KEYBOARD_ID.equals(info.getId())) return true;
        }
        return false;
    }

    private boolean isActive() {
        String current = Settings.Secure.getString(
                getContext().getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        return KEYBOARD_ID.equals(current);
    }
}
