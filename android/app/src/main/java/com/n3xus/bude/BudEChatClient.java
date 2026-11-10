package com.n3xus.bude;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Minimal client for the existing Bud-E chat backend — the same contract the
 * web app uses, no new endpoints. POST /api/chat with
 * { messages: [{role, text}], persona } and read back { ok, source, reply }.
 *
 * Call it from a background thread (it does blocking network I/O). Returns
 * the reply text, or null when the server could not answer (fallback reply,
 * network failure, or a bad response). No auth, no cookies, no keys.
 */
public final class BudEChatClient {
    /** Production origin — the same live site the Capacitor app talks to. */
    private static final String CHAT_URL = "https://stoner-bud-e.vercel.app/api/chat";
    private static final int TIMEOUT_MS = 30000;

    private BudEChatClient() {
    }

    /** The device's local wall-clock time as ISO with offset, so the server
     *  can resolve relative times ("tomorrow at noon") for device actions. */
    private static String localIsoNow() {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US);
        fmt.setTimeZone(TimeZone.getDefault());
        return fmt.format(new Date());
    }

    public static String ask(String text) {
        return ask(null, text);
    }

    /** Same as {@link #ask(String)}, but the stash summary the app
     *  published is sent along, so Bud-E knows what jars exist when the
     *  user asks it to change the stash. */
    public static String ask(android.content.Context context, String text) {
        JSONArray messages = new JSONArray();
        try {
            JSONObject message = new JSONObject();
            message.put("role", "user");
            message.put("text", text);
            messages.put(message);
        } catch (Exception e) {
            return null;
        }
        return post(messages, readStashSummary(context));
    }

    /** Same call, with the conversation so far — the bubble chat keeps
     *  context instead of answering every message cold like the voice
     *  session does. Each entry is {role, text}; roles are "user" or
     *  "assistant". */
    public static String askHistory(java.util.List<String[]> history) {
        return askHistory(null, history);
    }

    /** Same as {@link #askHistory(java.util.List)}, but the stash summary
     *  the app published is sent along. */
    public static String askHistory(android.content.Context context, java.util.List<String[]> history) {
        JSONArray messages = new JSONArray();
        try {
            for (String[] entry : history) {
                if (entry == null || entry.length < 2) continue;
                JSONObject message = new JSONObject();
                message.put("role", entry[0]);
                message.put("text", entry[1]);
                messages.put(message);
            }
        } catch (Exception e) {
            return null;
        }
        if (messages.length() == 0) return null;
        return post(messages, readStashSummary(context));
    }

    /** Where the app publishes the stash summary for the native chats. */
    public static final String STASH_PREFS = "bude-stash";
    public static final String STASH_SUMMARY_KEY = "summary";

    /** The stash summary the app published, or null when there is none. */
    private static String readStashSummary(android.content.Context context) {
        if (context == null) return null;
        try {
            String summary = context.getSharedPreferences(STASH_PREFS, android.content.Context.MODE_PRIVATE)
                    .getString(STASH_SUMMARY_KEY, "");
            return summary == null || summary.isEmpty() ? null : summary;
        } catch (Exception e) {
            return null;
        }
    }

    private static String post(JSONArray messages) {
        return post(messages, null);
    }

    private static String post(JSONArray messages, String stashSummary) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(CHAT_URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("messages", messages);
            body.put("persona", "chill");
            // The server uses this to resolve "tomorrow at noon" and other
            // relative times into real dates for device actions.
            body.put("now", localIsoNow());
            // What jars exist and how much is in each — so Bud-E can add
            // to, take off, and log against the right jar.
            if (stashSummary != null && !stashSummary.isEmpty()) {
                body.put("stash", stashSummary);
            }

            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(payload);
            }

            int status = conn.getResponseCode();
            InputStream in = status >= 200 && status < 300
                    ? conn.getInputStream() : conn.getErrorStream();
            if (in == null) return null;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(in, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
            }
            JSONObject res = new JSONObject(sb.toString());
            if (!res.optBoolean("ok", false)) return null;
            String reply = res.optString("reply", null);
            if (reply == null || reply.trim().isEmpty()) return null;
            return reply;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
