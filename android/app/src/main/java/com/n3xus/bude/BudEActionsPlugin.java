package com.n3xus.bude;

import android.Manifest;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

/**
 * Capacitor bridge for Bud-E's device actions (see BudEActions): the web
 * chat calls execute({action}) and the native helper does the work.
 * Some actions need a runtime permission — flashlight needs the camera,
 * calls/texts need contacts. When one is missing, the plugin asks the
 * phone once and retries after the answer instead of failing.
 */
@CapacitorPlugin(
        name = "BudEActions",
        permissions = {
                @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
                @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = "contacts")
        }
)
public class BudEActionsPlugin extends Plugin {
    private JSONObject pendingAction;

    @PluginMethod
    public void execute(PluginCall call) {
        JSObject action = call.getObject("action");
        if (action == null) {
            call.resolve(new JSObject()
                    .put("ok", false)
                    .put("message", "there was nothing to do"));
            return;
        }
        runAction(call, action);
    }

    private void runAction(PluginCall call, JSONObject action) {
        BudEActions.Result result = BudEActions.execute(getContext(), action);
        if (!result.ok && "camera-permission".equals(result.code)) {
            // Ask once, then retry in the permission callback below.
            pendingAction = action;
            requestPermissionForAlias("camera", call, "onCameraPermission");
            return;
        }
        if (!result.ok && "contacts-permission".equals(result.code)) {
            // Ask once, then retry in the permission callback below.
            pendingAction = action;
            requestPermissionForAlias("contacts", call, "onContactsPermission");
            return;
        }
        JSObject res = new JSObject();
        res.put("ok", result.ok);
        res.put("message", result.message);
        call.resolve(res);
    }

    /** Retry the pending action after the user answers a permission prompt. */
    private void retryPending(PluginCall call, String alias, String emptyMessage,
                              String deniedMessage) {
        JSONObject action = pendingAction;
        pendingAction = null;
        if (action == null) {
            call.resolve(new JSObject()
                    .put("ok", false)
                    .put("message", emptyMessage));
            return;
        }
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            call.resolve(new JSObject()
                    .put("ok", false)
                    .put("message", deniedMessage));
            return;
        }
        BudEActions.Result result = BudEActions.execute(getContext(), action);
        JSObject res = new JSObject();
        res.put("ok", result.ok);
        res.put("message", result.message);
        call.resolve(res);
    }

    @PermissionCallback
    private void onCameraPermission(PluginCall call) {
        retryPending(call, "camera",
                "the flashlight is not available right now",
                "Camera access is off — allow it in the Bud-E app settings to use the flashlight.");
    }

    @PermissionCallback
    private void onContactsPermission(PluginCall call) {
        retryPending(call, "contacts",
                "I could not look them up right now",
                "Contacts access is off — allow it in the Bud-E app settings so I can find who to call or text.");
    }
}
