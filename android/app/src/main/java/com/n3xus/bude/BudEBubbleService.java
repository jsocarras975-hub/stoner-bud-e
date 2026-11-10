package com.n3xus.bude;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.InputType;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.util.ArrayList;

/**
 * Bud-E's floating chat bubble: a lime circle with a leaf that floats
 * over other apps. Drag it anywhere; tap it and the chat opens right
 * in the bubble — no need to open the app. Long-press the bubble (or
 * tap × in the chat) to hide it; that also switches it off, so it stays
 * gone until he turns it back on in Settings → Phone.
 *
 * The chat is a real conversation with the same /api/chat brain the app
 * uses (BudEChatClient.askHistory keeps the context), and it can run
 * device actions too — alarms, timers, reminders, calls and texts go
 * through the same relay the voice session uses, and the panel gets out
 * of the way when one opens another app. The chat history lives only
 * while the bubble is up; it is not the main chat's transcript.
 *
 * It runs as a foreground service so the bubble stays up when the app
 * is closed — the service shows a small ongoing notification while the
 * bubble is on. Needs "draw over other apps" allowed for Bud-E; the
 * Settings toggle opens that page when it isn't. A reboot brings the
 * bubble back (BudEBootReceiver), and the app re-asserts it on launch.
 */
public class BudEBubbleService extends Service {
    public static final String PREFS = "bude-bubble";
    public static final String KEY_ENABLED = "enabled";
    private static final int NOTIFICATION_ID = 1002;
    private static final String CHANNEL_ID = "bud-e-talk"; // same channel as the Talk notification

    private WindowManager windowManager;
    private ImageView bubble;
    private WindowManager.LayoutParams params;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable longPressHide;
    private float downRawX;
    private float downRawY;
    private int downX;
    private int downY;
    private boolean moved;

    // In-bubble chat: one panel, shown in place of the circle.
    private LinearLayout chatPanel;
    private ScrollView messageScroll;
    private LinearLayout messageList;
    private EditText chatInput;
    private boolean chatOpen;
    private boolean chatWaiting;
    private String chatNotice;
    /** The conversation so far, as {role, text} pairs — sent to the
     *  server each time so Bud-E keeps the context. Capped at 20. */
    private final ArrayList<String[]> chatHistory = new ArrayList<>();

    public static boolean isEnabled(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_ENABLED, false);
    }

    public static void setEnabled(Context context, boolean on) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_ENABLED, on).apply();
    }

    public static void start(Context context) {
        Intent intent = new Intent(context, BudEBubbleService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, BudEBubbleService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        bubble = new ImageView(this);
        bubble.setImageResource(R.drawable.ic_bud_leaf);
        bubble.setScaleType(ImageView.ScaleType.FIT_CENTER);
        bubble.setPadding(dp(12), dp(12), dp(12), dp(12));
        bubble.setBackgroundResource(R.drawable.bud_e_bubble_bg);
        bubble.setElevation(8f);
        int size = dp(64);
        params = new WindowManager.LayoutParams(
                size, size,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                android.graphics.PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = dp(16);
        params.y = dp(240);
        bubble.setOnTouchListener(this::onBubbleTouch);
        windowManager.addView(bubble, params);
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // If the system kills the service, bring the bubble back.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        cancelLongPress();
        if (windowManager != null) {
            if (bubble != null) {
                try {
                    windowManager.removeView(bubble);
                } catch (Exception ignored) {
                    // Already gone — nothing to remove.
                }
                bubble = null;
            }
            if (chatPanel != null) {
                try {
                    windowManager.removeView(chatPanel);
                } catch (Exception ignored) {
                    // Already gone — nothing to remove.
                }
                chatPanel = null;
            }
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private boolean onBubbleTouch(View view, MotionEvent event) {
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                downRawX = event.getRawX();
                downRawY = event.getRawY();
                downX = params.x;
                downY = params.y;
                moved = false;
                cancelLongPress();
                longPressHide = this::hideBubble;
                handler.postDelayed(longPressHide, 600);
                return true;
            case MotionEvent.ACTION_MOVE: {
                int dx = (int) (event.getRawX() - downRawX);
                int dy = (int) (event.getRawY() - downRawY);
                if (Math.abs(dx) > dp(10) || Math.abs(dy) > dp(10)) {
                    moved = true;
                    cancelLongPress();
                    params.x = downX + dx;
                    params.y = downY + dy;
                    windowManager.updateViewLayout(bubble, params);
                }
                return true;
            }
            case MotionEvent.ACTION_UP:
                cancelLongPress();
                if (!moved) {
                    expandChat();
                }
                return true;
            case MotionEvent.ACTION_CANCEL:
                cancelLongPress();
                return true;
            default:
                return false;
        }
    }

    private void cancelLongPress() {
        if (longPressHide != null) {
            handler.removeCallbacks(longPressHide);
            longPressHide = null;
        }
    }

    // ------------------------------------------------------------ In-bubble chat

    /** Tap the bubble: swap the circle for the chat panel. */
    private void expandChat() {
        if (chatOpen) return;
        chatOpen = true;
        if (chatPanel == null) buildChatPanel();
        if (bubble != null) {
            try {
                windowManager.removeView(bubble);
            } catch (Exception ignored) {
                // Already gone — nothing to remove.
            }
        }
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int width = Math.min(dm.widthPixels - dp(32), dp(420));
        int height = Math.min((int) (dm.heightPixels * 0.72), dp(560));
        WindowManager.LayoutParams panelParams = new WindowManager.LayoutParams(
                width, height,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                // Touches outside the panel go to the app behind, but the
                // panel keeps focus so the keyboard works for typing.
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                android.graphics.PixelFormat.TRANSLUCENT);
        panelParams.gravity = Gravity.CENTER;
        windowManager.addView(chatPanel, panelParams);
        renderMessages();
        chatInput.post(() -> {
            chatInput.requestFocus();
            showKeyboard();
        });
    }

    /** Minimize: back to the floating circle, chat kept. */
    private void collapseToBubble() {
        if (!chatOpen) return;
        chatOpen = false;
        hideKeyboard();
        if (chatPanel != null) {
            try {
                windowManager.removeView(chatPanel);
            } catch (Exception ignored) {
                // Already gone — nothing to remove.
            }
        }
        if (bubble != null && windowManager != null) {
            windowManager.addView(bubble, params);
        }
    }

    /** Long-press the bubble, or × in the chat: take it down and switch it off. */
    private void hideBubble() {
        hideKeyboard();
        if (chatOpen && chatPanel != null) {
            try {
                windowManager.removeView(chatPanel);
            } catch (Exception ignored) {
                // Already gone — nothing to remove.
            }
            chatOpen = false;
        } else if (bubble != null && windowManager != null) {
            try {
                windowManager.removeView(bubble);
            } catch (Exception ignored) {
                // Already gone — nothing to remove.
            }
        }
        bubble = null;
        chatPanel = null;
        setEnabled(this, false);
        Toast.makeText(this, "Bubble hidden — turn it back on in Settings, under Phone.", Toast.LENGTH_LONG).show();
        stopSelf();
    }

    private void buildChatPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackgroundResource(R.drawable.bud_e_widget_bg);
        panel.setPadding(dp(12), dp(12), dp(12), dp(12));

        // Header: Bud-E, minimize, close.
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText("Bud-E");
        title.setTextColor(0xFFC6F25C);
        title.setTextSize(18);
        title.setTypeface(null, Typeface.BOLD);
        header.addView(title, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView minimize = headerButton("\u2014"); // em dash
        minimize.setOnClickListener(v -> collapseToBubble());
        header.addView(minimize);
        TextView close = headerButton("\u00D7"); // multiplication x
        close.setOnClickListener(v -> hideBubble());
        header.addView(close);
        panel.addView(header);

        // Messages.
        messageScroll = new ScrollView(this);
        messageList = new LinearLayout(this);
        messageList.setOrientation(LinearLayout.VERTICAL);
        messageScroll.addView(messageList, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        scrollLp.topMargin = dp(8);
        panel.addView(messageScroll, scrollLp);

        // Input row: text field + Send.
        LinearLayout inputRow = new LinearLayout(this);
        inputRow.setOrientation(LinearLayout.HORIZONTAL);
        inputRow.setGravity(Gravity.CENTER_VERTICAL);
        chatInput = new EditText(this);
        chatInput.setHint("Ask Bud-E\u2026");
        chatInput.setHintTextColor(0xFF8E8E96);
        chatInput.setTextColor(0xFFF2F0EB);
        chatInput.setBackgroundResource(R.drawable.bud_e_widget_btn_ghost);
        chatInput.setPadding(dp(10), dp(10), dp(10), dp(10));
        chatInput.setSingleLine(true);
        chatInput.setImeOptions(EditorInfo.IME_ACTION_SEND);
        chatInput.setInputType(InputType.TYPE_CLASS_TEXT);
        chatInput.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                sendChatFromInput();
                return true;
            }
            return false;
        });
        inputRow.addView(chatInput, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView send = new TextView(this);
        send.setText("Send");
        send.setTextColor(0xFF07110C);
        send.setTypeface(null, Typeface.BOLD);
        send.setGravity(Gravity.CENTER);
        send.setBackgroundResource(R.drawable.bud_e_widget_btn_talk);
        send.setPadding(dp(14), dp(10), dp(14), dp(10));
        send.setOnClickListener(v -> sendChatFromInput());
        LinearLayout.LayoutParams sendLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        sendLp.leftMargin = dp(8);
        inputRow.addView(send, sendLp);
        LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        rowLp.topMargin = dp(8);
        panel.addView(inputRow, rowLp);

        chatPanel = panel;
    }

    private TextView headerButton(String label) {
        TextView button = new TextView(this);
        button.setText(label);
        button.setTextColor(0xFFF2F0EB);
        button.setTextSize(18);
        button.setGravity(Gravity.CENTER);
        button.setBackgroundResource(R.drawable.bud_e_widget_btn_ghost);
        button.setPadding(dp(12), dp(6), dp(12), dp(6));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = dp(8);
        button.setLayoutParams(lp);
        return button;
    }

    /** Rebuild the message list from the history (plus a typing line while waiting). */
    private void renderMessages() {
        if (messageList == null) return;
        messageList.removeAllViews();
        for (String[] entry : chatHistory) {
            boolean user = "user".equals(entry[0]);
            TextView view = new TextView(this);
            view.setText(entry[1]);
            view.setTextSize(14);
            view.setPadding(dp(10), dp(8), dp(10), dp(8));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.topMargin = dp(6);
            if (user) {
                view.setBackgroundResource(R.drawable.bud_e_widget_btn_talk);
                view.setTextColor(0xFF07110C);
                lp.gravity = Gravity.END;
            } else {
                view.setBackgroundResource(R.drawable.bud_e_widget_btn_ghost);
                view.setTextColor(0xFFF2F0EB);
                lp.gravity = Gravity.START;
            }
            messageList.addView(view, lp);
        }
        if (chatNotice != null) {
            TextView notice = new TextView(this);
            notice.setText(chatNotice);
            notice.setTextColor(0xFF8E8E96);
            notice.setTextSize(13);
            notice.setPadding(dp(10), dp(8), dp(10), dp(8));
            messageList.addView(notice);
        }
        if (chatWaiting) {
            TextView typing = new TextView(this);
            typing.setText("Bud-E is typing\u2026");
            typing.setTextColor(0xFF8E8E96);
            typing.setTextSize(13);
            typing.setPadding(dp(10), dp(8), dp(10), dp(8));
            messageList.addView(typing);
        }
        if (messageScroll != null) {
            messageScroll.post(() -> messageScroll.fullScroll(View.FOCUS_DOWN));
        }
    }

    private void sendChatFromInput() {
        if (chatWaiting) return;
        String text = chatInput.getText().toString().trim();
        if (text.isEmpty()) return;
        chatInput.setText("");
        chatNotice = null;
        chatHistory.add(new String[]{"user", text});
        trimHistory();
        chatWaiting = true;
        renderMessages();
        new Thread(() -> {
            final String reply = BudEChatClient.askHistory(new ArrayList<>(chatHistory));
            handler.post(() -> onChatReply(reply));
        }).start();
    }

    private void onChatReply(String reply) {
        chatWaiting = false;
        if (reply == null) {
            chatNotice = "Couldn't reach Bud-E — check your connection and try again.";
            renderMessages();
            return;
        }
        String shown = handleReplyActions(reply);
        chatHistory.add(new String[]{"assistant", shown});
        trimHistory();
        renderMessages();
    }

    /**
     * The reply's spoken sentence, with any device action run the same way
     * the voice session runs it: actions that open another app (alarm,
     * timer, calendar, call, text) go through MainActivity, and the panel
     * gets out of the way so the opened app is visible; the rest run
     * right here (reminders, flashlight).
     */
    private String handleReplyActions(String reply) {
        JSONObject action = BudEActions.extractAction(reply);
        String clean = BudEActions.stripActionBlock(reply);
        if (action != null && BudEActions.isIntentAction(action)) {
            try {
                startActivity(BudEActions.buildRelayIntent(this, action));
                collapseToBubble();
                return clean + " " + BudEActions.intentOkMessage(action);
            } catch (Exception e) {
                return clean + " The phone could not open that.";
            }
        }
        BudEActions.Outcome outcome = BudEActions.handleReply(this, reply);
        String shown = outcome.cleanText;
        if (outcome.attempted && !outcome.ok) {
            shown = outcome.cleanText + " " + outcome.message;
        }
        return shown;
    }

    /** Keep the history short — the oldest pair goes when it passes 20. */
    private void trimHistory() {
        while (chatHistory.size() > 20) {
            chatHistory.remove(0);
            chatHistory.remove(0);
        }
    }

    private void showKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null && chatInput != null) {
            imm.showSoftInput(chatInput, InputMethodManager.SHOW_IMPLICIT);
        }
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null && chatInput != null) {
            imm.hideSoftInputFromWindow(chatInput.getWindowToken(), 0);
        }
    }

    // ------------------------------------------------------------ Notification

    private Notification buildNotification() {
        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Bud-E talk", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("One tap to talk to Bud-E.");
            manager.createNotificationChannel(channel);
        }
        PendingIntent open = PendingIntent.getActivity(
                this, 0,
                new Intent(this, MainActivity.class)
                        .putExtra("bude_tab", "chat")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Bud-E bubble is on")
                .setContentText("Tap the bubble to chat. Long-press it to hide it.")
                .setContentIntent(open)
                .setOngoing(true)
                .build();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
