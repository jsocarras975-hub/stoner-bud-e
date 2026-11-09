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
 * Flashlight needs the camera permission — when it is missing, the plugin
 * asks the phone once and retries after the answer instead of failing.
 */
@CapacitorPlugin(
        name = "BudEActions",
        permissions = @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
)
public class BudEActionsPlugin extends Plugin {
    private JSONObject pendingFlashlightAction;

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
            pendingFlashlightAction = action;
            requestPermissionForAlias("camera", call, "onCameraPermission");
            return;
        }
        JSObject res = new JSObject();
        res.put("ok", result.ok);
        res.put("message", result.message);
        call.resolve(res);
    }

    @PermissionCallback
    private void onCameraPermission(PluginCall call) {
        JSONObject action = pendingFlashlightAction;
        pendingFlashlightAction = null;
        if (action == null) {
            call.resolve(new JSObject()
                    .put("ok", false)
                    .put("message", "the flashlight is not available right now"));
            return;
        }
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.resolve(new JSObject()
                    .put("ok", false)
                    .put("message", "Camera access is off — allow it in the Bud-E app settings to use the flashlight."));
            return;
        }
        BudEActions.Result result = BudEActions.execute(getContext(), action);
        JSObject res = new JSObject();
        res.put("ok", result.ok);
        res.put("message", result.message);
        call.resolve(res);
    }
}
