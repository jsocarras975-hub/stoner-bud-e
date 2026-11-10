package com.n3xus.bude;

import android.Manifest;
import android.app.assist.AssistContent;
import android.app.assist.AssistStructure;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.voice.VoiceInteractionSession;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.json.JSONObject;

/**
 * Bud-E's assist session — the voice overlay Android shows when the user
 * long-presses home (or swipes the corner) with Bud-E set as the default
 * digital assistant.
 *
 * Flow: listen with the phone's speech recognizer → send the transcript to
 * the existing /api/chat backend (same contract as the web app) → show the
 * reply and speak it with Android text-to-speech. One question per session
 * listen; tap the mic to ask again, "Open app" to jump into the full app.
 *
 * The session cannot ask for the microphone permission itself (it has no
 * activity), so if RECORD_AUDIO was never granted in the app, it says so and
 * points at the app instead of failing silently.
 */
public class BudESession extends VoiceInteractionSession {
    // Night-garden tokens, same as the web app.
    private static final int COLOR_BG = 0xFF07110C;
    private static final int COLOR_CARD = 0xFF163024;
    private static final int COLOR_ACCENT = 0xFFC6F25C;
    private static final int COLOR_ACCENT_INK = 0xFF142107;
    private static final int COLOR_TEXT = 0xFFF3F6EA;
    private static final int COLOR_MUTED = 0xFFB7CBB0;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();

    private TextView statusView;
    private TextView heardView;
    private TextView replyView;
    private Button micButton;

    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private boolean ttsReady;
    private boolean listening;
    private boolean destroyed;
    /** True when this showing was handed off to the bubble chat, so a late
     *  onHandleAssist does not start listening anyway. */
    private boolean bubbleRedirected;

    public BudESession(Context context) {
        super(context);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        buildUi();
        setContentView(rootView);
        initTts();
        refreshPermissionHint();
    }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);
        // The power-button long-press (and any other system trigger) opens
        // the bubble chat now, not the voice overlay — only an explicit
        // voice request (the notification's Talk button, marked bude_voice)
        // listens. The session goes away; the bubble chat opens in its place.
        if (args == null || !args.getBoolean("bude_voice", false)) {
            bubbleRedirected = true;
            openBubbleChat();
            return;
        }
        bubbleRedirected = false;
        startListening();
    }

    @Override
    public void onHandleAssist(Bundle data, AssistStructure structure, AssistContent content) {
        super.onHandleAssist(data, structure, content);
        if (bubbleRedirected) return;
        startListening();
    }

    @Override
    public void onHide() {
        bubbleRedirected = false;
        stopListening();
        stopSpeaking();
        super.onHide();
    }

    @Override
    public void onBackPressed() {
        hide();
    }

    @Override
    public void onDestroy() {
        destroyed = true;
        stopListening();
        if (tts != null) {
            try {
                tts.shutdown();
            } catch (Exception ignored) {
                // Already shut down.
            }
            tts = null;
        }
        network.shutdownNow();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ UI

    private LinearLayout rootView;

    private void buildUi() {
        Context ctx = getContext();
        rootView = new LinearLayout(ctx);
        rootView.setOrientation(LinearLayout.VERTICAL);
        rootView.setBackgroundColor(COLOR_BG);
        int pad = dp(20);
        rootView.setPadding(pad, pad, pad, pad);
        rootView.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = new TextView(ctx);
        title.setText("Bud-E");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        title.setTextColor(COLOR_ACCENT);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        rootView.addView(title);

        TextView subtitle = new TextView(ctx);
        subtitle.setText("Your buddy — talk, and I'll answer.");
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        subtitle.setTextColor(COLOR_MUTED);
        subtitle.setPadding(0, dp(2), 0, dp(14));
        rootView.addView(subtitle);

        statusView = new TextView(ctx);
        statusView.setText("Tap the mic and talk.");
        statusView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        statusView.setTextColor(COLOR_TEXT);
        statusView.setPadding(0, 0, 0, dp(8));
        rootView.addView(statusView);

        heardView = new TextView(ctx);
        heardView.setText("");
        heardView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        heardView.setTextColor(COLOR_MUTED);
        heardView.setPadding(0, 0, 0, dp(8));
        rootView.addView(heardView);

        ScrollView scroll = new ScrollView(ctx);
        scroll.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(220)));
        scroll.setBackground(rounded(COLOR_CARD, 12));
        scroll.setPadding(dp(12), dp(12), dp(12), dp(12));
        replyView = new TextView(ctx);
        replyView.setText("Ask me anything — strains, sessions, the weather, whatever's on your mind.");
        replyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        replyView.setTextColor(COLOR_TEXT);
        scroll.addView(replyView);
        rootView.addView(scroll);

        micButton = new Button(ctx);
        micButton.setText("\uD83C\uDFA4  Talk");
        micButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        micButton.setTextColor(COLOR_ACCENT_INK);
        micButton.setBackground(rounded(COLOR_ACCENT, 24));
        LinearLayout.LayoutParams micParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        micParams.topMargin = dp(14);
        micButton.setLayoutParams(micParams);
        micButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopSpeaking();
                startListening();
            }
        });
        rootView.addView(micButton);

        LinearLayout row = new LinearLayout(ctx);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        rowParams.topMargin = dp(10);
        row.setLayoutParams(rowParams);

        Button openApp = new Button(ctx);
        openApp.setText("Open app");
        openApp.setTextColor(COLOR_TEXT);
        openApp.setBackground(rounded(COLOR_CARD, 24));
        LinearLayout.LayoutParams openParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        openParams.rightMargin = dp(6);
        openApp.setLayoutParams(openParams);
        openApp.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openFullApp();
            }
        });
        row.addView(openApp);

        Button close = new Button(ctx);
        close.setText("Close");
        close.setTextColor(COLOR_TEXT);
        close.setBackground(rounded(COLOR_CARD, 24));
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        closeParams.leftMargin = dp(6);
        close.setLayoutParams(closeParams);
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                hide();
            }
        });
        row.addView(close);
        rootView.addView(row);
    }

    private GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radiusDp));
        return d;
    }

    private int dp(int value) {
        return Math.round(value * getContext().getResources().getDisplayMetrics().density);
    }

    private void setStatus(final String text) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (statusView != null) statusView.setText(text);
            }
        });
    }

    // -------------------------------------------------------------- Listening

    private boolean hasMicPermission() {
        return getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void refreshPermissionHint() {
        if (!hasMicPermission()) {
            setStatus("Mic access is off — open the Bud-E app and allow the "
                    + "microphone, then try again.");
        } else if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            setStatus("Voice recognition isn't available on this phone.");
        }
    }

    private void startListening() {
        if (destroyed || listening) return;
        if (!hasMicPermission()) {
            refreshPermissionHint();
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            setStatus("Voice recognition isn't available on this phone.");
            return;
        }
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override
                public void onReadyForSpeech(Bundle params) {
                    setStatus("Listening…");
                }

                @Override
                public void onBeginningOfSpeech() {
                    setStatus("Listening…");
                }

                @Override
                public void onRmsChanged(float rmsdB) {
                    // Volume meter not shown in v1.
                }

                @Override
                public void onBufferReceived(byte[] buffer) {
                }

                @Override
                public void onEndOfSpeech() {
                    setStatus("Got it — thinking…");
                }

                @Override
                public void onError(int error) {
                    listening = false;
                    if (error == SpeechRecognizer.ERROR_NO_MATCH
                            || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                        setStatus("Didn't catch that — tap the mic to try again.");
                    } else if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                        refreshPermissionHint();
                    } else if (error == SpeechRecognizer.ERROR_CLIENT) {
                        setStatus("Voice input stopped — tap the mic to try again.");
                    } else {
                        setStatus("Voice recognition hit a snag — tap the mic to try again.");
                    }
                }

                @Override
                public void onResults(Bundle results) {
                    listening = false;
                    String heard = BudERecognitionService.bestResult(results);
                    if (heard == null) {
                        setStatus("Didn't catch that — tap the mic to try again.");
                        return;
                    }
                    heardView.setText("You said: " + heard);
                    askChat(heard);
                }

                @Override
                public void onPartialResults(Bundle partialResults) {
                    String partial =
                            BudERecognitionService.bestResult(partialResults);
                    if (partial != null) {
                        heardView.setText("You said: " + partial);
                    }
                }

                @Override
                public void onEvent(int eventType, Bundle params) {
                }
            });
        }
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.US.toString());
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        try {
            listening = true;
            setStatus("Listening…");
            recognizer.startListening(intent);
        } catch (Exception e) {
            listening = false;
            setStatus("Couldn't start listening — tap the mic to try again.");
        }
    }

    private void stopListening() {
        listening = false;
        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (Exception ignored) {
                // Already stopped.
            }
            try {
                recognizer.destroy();
            } catch (Exception ignored) {
                // Already destroyed.
            }
            recognizer = null;
        }
    }

    // ------------------------------------------------------------------ Chat

    private void askChat(final String text) {
        setStatus("Thinking…");
        network.execute(new Runnable() {
            @Override
            public void run() {
                final String reply = BudEChatClient.ask(getContext(), text);
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        if (destroyed) return;
                        if (reply != null) {
                            // Device actions: native ones (reminders,
                            // flashlight) run here as before. Intent actions
                            // (alarm / timer / calendar) cannot be started
                            // from the session itself — both
                            // startAssistantActivity and a plain start throw
                            // a SecurityException for them — so they go
                            // through the app: open MainActivity with the
                            // action attached and let it fire the intent
                            // from the foreground.
                            JSONObject action = BudEActions.extractAction(reply);
                            String clean = BudEActions.stripActionBlock(reply);
                            String shown;
                            if (action != null && BudEActions.isAppAction(action)) {
                                // App actions (stash, journal, navigation)
                                // run in the app itself — the session has no
                                // access to the app's state. Relay the action
                                // to MainActivity, which stores it for the
                                // web app to apply, then get out of the way
                                // so the user can see the result.
                                boolean relayed = false;
                                try {
                                    startAssistantActivity(
                                            BudEActions.buildAppActionIntent(getContext(), action));
                                    relayed = true;
                                } catch (Exception e) {
                                    // Fall through to the plain sentence.
                                }
                                shown = clean;
                                replyView.setText(shown);
                                setStatus("Here's what Bud-E says — tap the mic to ask more.");
                                speak(shown);
                                if (relayed) {
                                    mainHandler.postDelayed(new Runnable() {
                                        @Override
                                        public void run() {
                                            if (!destroyed) hide();
                                        }
                                    }, 3500);
                                }
                            } else if (action != null && BudEActions.isIntentAction(action)) {
                                boolean relayed = false;
                                try {
                                    startAssistantActivity(
                                            BudEActions.buildRelayIntent(getContext(), action));
                                    shown = clean + " " + BudEActions.intentOkMessage(action);
                                    relayed = true;
                                } catch (Exception e) {
                                    shown = clean + " The phone could not open that.";
                                }
                                replyView.setText(shown);
                                setStatus("Here's what Bud-E says — tap the mic to ask more.");
                                speak(shown);
                                if (relayed) {
                                    // The relay opens another app (dialer,
                                    // clock, calendar) — but this session's
                                    // overlay stays on top of it unless we
                                    // go away, so the user would see Bud-E
                                    // still and think nothing happened (same
                                    // as openFullApp, which hides after
                                    // launching). Hide after a short delay
                                    // so the spoken sentence gets out first
                                    // — hiding stops the speech.
                                    mainHandler.postDelayed(new Runnable() {
                                        @Override
                                        public void run() {
                                            if (!destroyed) hide();
                                        }
                                    }, 3500);
                                }
                            } else {
                                BudEActions.Outcome outcome = BudEActions.handleReply(
                                        getContext(), reply,
                                        new BudEActions.ActivityLauncher() {
                                            @Override
                                            public void launch(Intent intent) {
                                                startAssistantActivity(intent);
                                            }
                                        });
                                shown = outcome.cleanText;
                                if (outcome.attempted && !outcome.ok) {
                                    shown = outcome.cleanText + " " + outcome.message;
                                }
                                replyView.setText(shown);
                                setStatus("Here's what Bud-E says — tap the mic to ask more.");
                                speak(shown);
                            }
                        } else {
                            replyView.setText("");
                            setStatus("Couldn't reach Bud-E — check your connection "
                                    + "and tap the mic to try again.");
                        }
                    }
                });
            }
        });
    }

    // ------------------------------------------------------------------ Speech

    private void initTts() {
        try {
            tts = new TextToSpeech(getContext(), new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int status) {
                    if (status == TextToSpeech.SUCCESS && tts != null) {
                        int lang = tts.setLanguage(Locale.US);
                        ttsReady = lang != TextToSpeech.LANG_MISSING_DATA
                                && lang != TextToSpeech.LANG_NOT_SUPPORTED;
                    } else {
                        ttsReady = false;
                    }
                }
            });
        } catch (Exception e) {
            tts = null;
            ttsReady = false;
        }
    }

    private void speak(String text) {
        if (tts != null && ttsReady) {
            try {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "bude-utterance");
            } catch (Exception ignored) {
                // Showing the text is enough; speaking is a bonus.
            }
        }
    }

    private void stopSpeaking() {
        if (tts != null) {
            try {
                tts.stop();
            } catch (Exception ignored) {
                // Already stopped.
            }
        }
    }

    // ------------------------------------------------------------------ App

    /** Power-button long-press: open the bubble chat directly — the app
     *  itself never opens, so the panel floats over whatever he was
     *  doing. Goes straight to the bubble service (the overlay permission
     *  is checked first); when it is not allowed, the app's chat tab is
     *  the fallback instead of nothing. */
    private void openBubbleChat() {
        if (!android.provider.Settings.canDrawOverlays(getContext())) {
            Intent intent = new Intent(getContext(), MainActivity.class);
            intent.putExtra(BudELaunchInfo.EXTRA_TAB, "chat");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            try {
                startAssistantActivity(intent);
            } catch (Exception e) {
                try {
                    getContext().startActivity(intent);
                } catch (Exception ignored) {
                    // The app could not be opened from here — fall back to
                    // listening as before, instead of showing nothing.
                    bubbleRedirected = false;
                    startListening();
                    return;
                }
            }
            hide();
            return;
        }
        try {
            BudEBubbleService.setEnabled(getContext(), true);
            BudEBubbleService.startWithAction(getContext(), BudEBubbleService.ACTION_EXPAND_CHAT);
        } catch (Exception e) {
            // The bubble could not be started — fall back to listening as
            // before, instead of showing nothing.
            bubbleRedirected = false;
            startListening();
            return;
        }
        hide();
    }

    private void openFullApp() {
        stopListening();
        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            startAssistantActivity(intent);
        } catch (Exception e) {
            try {
                getContext().startActivity(intent);
            } catch (Exception ignored) {
                // The app could not be opened from here.
            }
        }
        hide();
    }
}
