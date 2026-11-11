package com.n3xus.bude;

import android.Manifest;
import android.content.ClipDescription;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.inputmethodservice.InputMethodService;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputContentInfo;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Bud-E Keyboard — an Android input method (IME) in the same Bud-E app
 * and APK. QWERTY letters + a symbols page + a media tab (his 20 stickers
 * and an emoji picker) + a leaf key that jumps into the Bud-E app, all in
 * the night-garden look (and it follows the app's theme).
 *
 * v2 adds: word predictions + autocorrect (BudEWordEngine, 10k-word
 * frequency list, learns words the user types twice), a voice-typing mic
 * key (SpeechRecognizer, inserts what it hears), an emoji tab next to the
 * stickers, and theme matching (the web app pushes the theme id into
 * SharedPreferences; the keyboard reads it each time it opens).
 *
 * The user turns it on in Settings (see BudEKeyboardPlugin + the Keyboard
 * row in the app's Settings tab): Android makes the user pick the keyboard
 * — an app can never set itself. Stickers go out with
 * InputConnection.commitContent (API 25+), so they only land in apps that
 * accept image input (messaging apps mostly do); anywhere else the keyboard
 * says so instead of failing quietly. No swipe typing — that is a whole
 * other project, and it is parked on purpose.
 */
public class BudEKeyboardService extends InputMethodService {

    private static final int STICKER_COUNT = 20;
    private static final String STICKER_ASSET_PREFIX = "public/stickers/match-";
    private static final String THEME_PREFS = "bude-keyboard-prefs";
    private static final String THEME_KEY = "theme";
    private static final long BACKSPACE_REPEAT_DELAY_MS = 350;
    private static final long BACKSPACE_REPEAT_INTERVAL_MS = 60;

    private static final String[] EMOJIS = {
            "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😴",
            "😭", "😡", "🤯", "🥴", "😇", "😜", "🙃", "😢", "😅", "😌",
            "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "💯", "🔥",
            "👍", "👎", "🙏", "👏", "✌️", "🤞", "👀", "🙌", "💪", "🤙",
            "🍃", "🌿", "🌱", "🍀", "🌵", "🌸", "🌙", "⭐", "☀️", "🌧️",
            "🍕", "🍔", "🍟", "🍩", "🍪", "🍦", "☕", "🍺", "🥤", "🍓",
            "🎵", "🎧", "🎬", "📸", "⚽", "🏀", "🎮", "🚗", "✈️", "🏠",
            "💤", "💨", "💡", "🎉", "🎁", "💎", "👑", "🚀", "🌈", "🍾",
    };

    private enum Mode { LETTERS, SYMBOLS, MEDIA }
    private enum MediaTab { STICKERS, EMOJI, APPS }

    private Mode mode = Mode.LETTERS;
    private MediaTab mediaTab = MediaTab.STICKERS;
    private boolean shifted = false;   // one-shot shift: next letter only
    private boolean capsLock = false;  // double-tap shift locks caps

    private BudEKeyboardTheme theme = BudEKeyboardTheme.forId("night");
    private BudEWordEngine wordEngine;

    private FrameLayout modeContainer;
    private LinearLayout suggestionBar;
    private final List<TextView> suggestionViews = new ArrayList<>();
    private final List<Button> letterKeys = new ArrayList<>();
    private Button shiftKey;
    private Button enterKey;
    private Button micKey;
    private boolean listening = false;
    private SpeechRecognizer speechRecognizer;

    private final Handler backspaceHandler = new Handler(Looper.getMainLooper());
    private final Runnable backspaceRepeater = new Runnable() {
        @Override
        public void run() {
            deleteChar();
            backspaceHandler.postDelayed(this, BACKSPACE_REPEAT_INTERVAL_MS);
        }
    };

    /** Secret hold gestures: hold two keys together for 3 seconds.
     *  J+S opens the Secret Room, B+E the hidden Strain Vault, 4+2 the
     *  420 Room, L+T toggles Lit Mode. Both keys must stay down the
     *  whole time. "lit" is a toggle, not a tab — the app reads it from
     *  the launch tab and switches Lit Mode on/off. */
    private static final long GESTURE_HOLD_MS = 3000;
    private static final String[][] GESTURE_PAIRS = {
        {"j", "s", "secret"},
        {"b", "e", "vault"},
        {"4", "2", "fourtwenty"},
        {"l", "t", "lit"},
    };
    private final java.util.Set<String> gestureDown = new java.util.HashSet<>();
    /** Release-clicks to swallow after a gesture fires, so the held keys
     *  don't also type themselves into the text field. */
    private final java.util.Set<String> suppressKeys = new java.util.HashSet<>();
    private final Handler gestureHandler = new Handler(Looper.getMainLooper());
    private Runnable pendingGesture = null;

    private static boolean isGestureKey(String label) {
        for (String[] pair : GESTURE_PAIRS) {
            if (pair[0].equals(label) || pair[1].equals(label)) return true;
        }
        return false;
    }

    private void onGestureKeyDown(String label) {
        gestureDown.add(label);
        for (String[] pair : GESTURE_PAIRS) {
            if (gestureDown.contains(pair[0]) && gestureDown.contains(pair[1])) {
                final String tab = pair[2];
                if (pendingGesture != null) gestureHandler.removeCallbacks(pendingGesture);
                pendingGesture = () -> {
                    gestureDown.clear();
                    suppressKeys.add(pair[0]);
                    suppressKeys.add(pair[1]);
                    pendingGesture = null;
                    openTab(tab);
                };
                gestureHandler.postDelayed(pendingGesture, GESTURE_HOLD_MS);
                return;
            }
        }
    }

    private void onGestureKeyUp(String label) {
        gestureDown.remove(label);
        if (pendingGesture != null) {
            gestureHandler.removeCallbacks(pendingGesture);
            pendingGesture = null;
        }
    }

    /** Attach the hold-gesture tracking to a key (letter or number row). */
    private void attachGestureTouch(Button key, String label) {
        if (!isGestureKey(label)) return;
        key.setOnTouchListener((v, event) -> {
            int action = event.getActionMasked();
            if (action == android.view.MotionEvent.ACTION_DOWN) {
                onGestureKeyDown(label);
            } else if (action == android.view.MotionEvent.ACTION_UP
                    || action == android.view.MotionEvent.ACTION_CANCEL) {
                onGestureKeyUp(label);
            }
            return false;
        });
    }

    /** The phone's launcher apps, for the Apps tab. Loaded once, lazily,
     *  the first time the tab opens, then cached. */
    private List<android.content.pm.ResolveInfo> launcherApps = null;

    // ------------------------------------------------------------------
    // InputMethodService
    // ------------------------------------------------------------------

    @Override
    public View onCreateInputView() {
        loadTheme();
        wordEngine = BudEWordEngine.get(this);
        // Warm the dictionary off the main thread so the first open is fast.
        new Thread(() -> wordEngine.ensureLoaded()).start();

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(theme.bg);
        final int pad = dp(4);
        root.setPadding(pad, pad, pad, pad);

        // The Android nav bar (back/home pill) sits at the very bottom and
        // overlaps the keyboard's bottom row. Two fixes, both live:
        // 1. Hide the nav bar while the keyboard is up (swipe up from the
        //    bottom brings it back for a moment, then it hides again).
        // 2. Pad the keyboard up above the nav bar whenever it is visible,
        //    so the bottom row is never covered even if the user swiped the
        //    bar back. The padding follows the live inset, so there is no
        //    gap when the bar is hidden.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int navBottom = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                navBottom = insets.getInsets(android.view.WindowInsets.Type.navigationBars()).bottom;
            } else {
                navBottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(pad, pad, pad, pad + navBottom);
            return insets;
        });

        // Top strip: the leaf + "Bud-E" on the left, mic + hide on the right.
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText("\uD83C\uDF43 Bud-E");
        title.setTextColor(theme.accent);
        title.setTextSize(14);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        top.addView(title, titleParams);
        micKey = makeKey("\uD83C\uDFA4", 1f);
        micKey.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            toggleVoice();
        });
        top.addView(micKey);
        Button hide = makeKey("\u25BC", 1f);
        hide.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            requestHideSelf(0);
        });
        top.addView(hide);
        root.addView(top);

        // Suggestion bar: three word completions, above the keys.
        suggestionBar = new LinearLayout(this);
        suggestionBar.setOrientation(LinearLayout.HORIZONTAL);
        for (int i = 0; i < 3; i++) {
            TextView suggestion = new TextView(this);
            suggestion.setGravity(Gravity.CENTER);
            suggestion.setTextSize(16);
            suggestion.setTextColor(theme.text);
            suggestion.setPadding(dp(4), dp(6), dp(4), dp(6));
            final int index = i;
            suggestion.setOnClickListener(v -> {
                v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                acceptSuggestion(index);
            });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            suggestionBar.addView(suggestion, params);
            suggestionViews.add(suggestion);
        }
        root.addView(suggestionBar);

        modeContainer = new FrameLayout(this);
        root.addView(modeContainer, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        showMode(mode);
        hideNavigationBar();
        return root;
    }

    @Override
    public void onStartInputView(EditorInfo info, boolean restarting) {
        super.onStartInputView(info, restarting);
        loadTheme();
        // Fresh open = back to letters, shift off.
        mode = Mode.LETTERS;
        shifted = false;
        capsLock = false;
        showMode(mode);
        updateEnterLabel(info);
        updateSuggestions();
        hideNavigationBar();
    }

    @Override
    public void onDestroy() {
        stopVoice();
        super.onDestroy();
    }

    // ------------------------------------------------------------------
    // Theme
    // ------------------------------------------------------------------

    private void loadTheme() {
        SharedPreferences prefs = getSharedPreferences(THEME_PREFS, Context.MODE_PRIVATE);
        theme = BudEKeyboardTheme.forId(prefs.getString(THEME_KEY, "night"));
    }

    /** A rounded key background in the current theme (normal + pressed). */
    private Drawable keyBackground(boolean accent) {
        int normal = accent ? theme.accent : theme.key;
        int pressed = accent ? lighten(theme.accent, 0.25f) : theme.keyPressed;
        GradientDrawable normalDrawable = new GradientDrawable();
        normalDrawable.setColor(normal);
        normalDrawable.setCornerRadius(dp(10));
        GradientDrawable pressedDrawable = new GradientDrawable();
        pressedDrawable.setColor(pressed);
        pressedDrawable.setCornerRadius(dp(10));
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_pressed}, pressedDrawable);
        states.addState(new int[]{}, normalDrawable);
        return states;
    }

    private static int lighten(int color, float amount) {
        int r = Math.min(255, (int) (android.graphics.Color.red(color) + (255 - android.graphics.Color.red(color)) * amount));
        int g = Math.min(255, (int) (android.graphics.Color.green(color) + (255 - android.graphics.Color.green(color)) * amount));
        int b = Math.min(255, (int) (android.graphics.Color.blue(color) + (255 - android.graphics.Color.blue(color)) * amount));
        return android.graphics.Color.rgb(r, g, b);
    }

    // ------------------------------------------------------------------
    // Modes
    // ------------------------------------------------------------------

    private void showMode(Mode next) {
        mode = next;
        if (modeContainer == null) return;
        modeContainer.removeAllViews();
        View view;
        if (next == Mode.SYMBOLS) {
            view = buildSymbolsView();
        } else if (next == Mode.MEDIA) {
            view = buildMediaView();
        } else {
            view = buildLettersView();
        }
        modeContainer.addView(view);
        refreshLetterLabels();
    }

    private View buildLettersView() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.addView(makeKeyRow(new String[]{"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"}, false));
        col.addView(makeKeyRow(new String[]{"q", "w", "e", "r", "t", "y", "u", "i", "o", "p"}, true));
        col.addView(makeKeyRow(new String[]{"a", "s", "d", "f", "g", "h", "j", "k", "l"}, true));
        // Row 3: shift + letters + backspace.
        LinearLayout row3 = new LinearLayout(this);
        row3.setOrientation(LinearLayout.HORIZONTAL);
        shiftKey = makeKey("\u21E7", 1.4f);
        shiftKey.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            onShiftTap();
        });
        row3.addView(shiftKey);
        for (String letter : new String[]{"z", "x", "c", "v", "b", "n", "m"}) {
            row3.addView(makeLetterKey(letter));
        }
        row3.addView(makeBackspaceKey(1.4f));
        col.addView(row3);
        col.addView(makeBottomRow(false));
        return col;
    }

    private View buildSymbolsView() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.addView(makeKeyRow(new String[]{"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"}, false));
        col.addView(makeKeyRow(new String[]{"@", "#", "$", "%", "&", "*", "-", "+", "(", ")"}, false));
        LinearLayout row3 = new LinearLayout(this);
        row3.setOrientation(LinearLayout.HORIZONTAL);
        for (String s : new String[]{"!", "?", "\"", "'", ":", ";", ",", ".", "/"}) {
            row3.addView(makePunctuationKey(s));
        }
        row3.addView(makeBackspaceKey(1.2f));
        col.addView(row3);
        col.addView(makeBottomRow(true));
        return col;
    }

    /** Media: a tab row (Stickers | Emoji) over a scrollable grid, then the
     *  bottom row. Stickers send as images; emoji insert as text. */
    private View buildMediaView() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        Button stickersTab = makeKey("Stickers", 1f);
        Button emojiTab = makeKey("Emoji", 1f);
        Button appsTab = makeKey("Apps", 1f);
        stickersTab.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            mediaTab = MediaTab.STICKERS;
            showMode(Mode.MEDIA);
        });
        emojiTab.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            mediaTab = MediaTab.EMOJI;
            showMode(Mode.MEDIA);
        });
        appsTab.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            mediaTab = MediaTab.APPS;
            showMode(Mode.MEDIA);
        });
        if (mediaTab == MediaTab.STICKERS) {
            stickersTab.setBackground(keyBackground(true));
            stickersTab.setTextColor(theme.accentInk);
        } else if (mediaTab == MediaTab.EMOJI) {
            emojiTab.setBackground(keyBackground(true));
            emojiTab.setTextColor(theme.accentInk);
        } else {
            appsTab.setBackground(keyBackground(true));
            appsTab.setTextColor(theme.accentInk);
        }
        tabs.addView(stickersTab);
        tabs.addView(emojiTab);
        tabs.addView(appsTab);
        col.addView(tabs);

        ScrollView scroll = new ScrollView(this);
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        grid.setUseDefaultMargins(false);
        int gap = dp(6);
        grid.setPadding(gap, gap, gap, gap);
        if (mediaTab == MediaTab.STICKERS) {
            AssetManager assets = getAssets();
            for (int i = 1; i <= STICKER_COUNT; i++) {
                String assetName = STICKER_ASSET_PREFIX + String.format(Locale.US, "%02d", i) + ".png";
                ImageButton btn = new ImageButton(this);
                btn.setBackground(keyBackground(false));
                btn.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
                int pad = dp(6);
                btn.setPadding(pad, pad, pad, pad);
                try (InputStream in = assets.open(assetName)) {
                    Bitmap bmp = BitmapFactory.decodeStream(in);
                    btn.setImageBitmap(bmp);
                } catch (Exception ignored) {
                    btn.setImageResource(R.drawable.ic_bud_leaf);
                }
                final String name = assetName;
                btn.setOnClickListener(v -> {
                    v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                    sendSticker(name);
                });
                GridLayout.LayoutParams params = new GridLayout.LayoutParams();
                params.width = 0;
                params.height = dp(64);
                params.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
                params.setMargins(gap / 2, gap / 2, gap / 2, gap / 2);
                grid.addView(btn, params);
            }
        } else if (mediaTab == MediaTab.EMOJI) {
            for (String emoji : EMOJIS) {
                Button btn = makeKey(emoji, 1f);
                btn.setTextSize(22);
                final String e = emoji;
                btn.setOnClickListener(v -> {
                    v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                    commitText(e);
                });
                GridLayout.LayoutParams params = new GridLayout.LayoutParams();
                params.width = 0;
                params.height = dp(56);
                params.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
                params.setMargins(gap / 2, gap / 2, gap / 2, gap / 2);
                grid.addView(btn, params);
            }
        } else {
            // Apps: every launcher app on the phone, icon + name, tap to open.
            List<android.content.pm.ResolveInfo> apps = getLauncherApps();
            if (apps.isEmpty()) {
                TextView empty = new TextView(this);
                empty.setText("No apps found on this phone.");
                empty.setTextColor(theme.muted);
                empty.setTextSize(15);
                empty.setGravity(Gravity.CENTER);
                empty.setPadding(dp(8), dp(24), dp(8), dp(24));
                grid.addView(empty);
            }
            for (android.content.pm.ResolveInfo info : apps) {
                String packageName = info.activityInfo.packageName;
                CharSequence label = info.loadLabel(getPackageManager());
                Drawable icon = info.loadIcon(getPackageManager());
                LinearLayout cell = new LinearLayout(this);
                cell.setOrientation(LinearLayout.VERTICAL);
                cell.setGravity(Gravity.CENTER_HORIZONTAL);
                cell.setBackground(keyBackground(false));
                cell.setPadding(dp(4), dp(8), dp(4), dp(8));
                android.widget.ImageView iconView = new android.widget.ImageView(this);
                iconView.setImageDrawable(icon);
                LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(40), dp(40));
                cell.addView(iconView, iconParams);
                TextView name = new TextView(this);
                name.setText(label);
                name.setTextColor(theme.text);
                name.setTextSize(11);
                name.setMaxLines(1);
                name.setEllipsize(android.text.TextUtils.TruncateAt.END);
                name.setGravity(Gravity.CENTER);
                LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                nameParams.topMargin = dp(4);
                cell.addView(name, nameParams);
                cell.setOnClickListener(v -> {
                    v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                    openApp(packageName);
                });
                GridLayout.LayoutParams params = new GridLayout.LayoutParams();
                params.width = 0;
                params.height = dp(72);
                params.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
                params.setMargins(gap / 2, gap / 2, gap / 2, gap / 2);
                grid.addView(cell, params);
            }
        }
        scroll.addView(grid);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(220));
        col.addView(scroll, scrollParams);
        col.addView(makeBottomRow(false));
        return col;
    }

    /** Bottom row: [?123 / ABC] [media] [space] [Bud-E leaf] [enter]. */
    private LinearLayout makeBottomRow(boolean onSymbols) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button modeKey = makeKey(onSymbols ? "ABC" : "?123", 1.2f);
        modeKey.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            showMode(onSymbols ? Mode.LETTERS : Mode.SYMBOLS);
        });
        row.addView(modeKey);
        Button mediaKey = makeKey("\uD83D\uDE00", 1f);
        mediaKey.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            showMode(mode == Mode.MEDIA ? Mode.LETTERS : Mode.MEDIA);
        });
        row.addView(mediaKey);
        Button space = makeKey("\uD83C\uDF43  Bud-E  \uD83C\uDF43", 3.4f);
        space.setTextSize(16);
        space.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            onSpace();
        });
        row.addView(space);
        Button bude = makeKey("\uD83C\uDF43", 1f);
        bude.setBackground(keyBackground(true));
        bude.setTextColor(theme.accentInk);
        bude.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            openBudEApp();
        });
        row.addView(bude);
        enterKey = makeKey("\u23CE", 1.4f);
        enterKey.setBackground(keyBackground(true));
        enterKey.setTextColor(theme.accentInk);
        enterKey.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            onEnter();
        });
        row.addView(enterKey);
        updateEnterLabel(getCurrentInputEditorInfo());
        return row;
    }

    // ------------------------------------------------------------------
    // Keys
    // ------------------------------------------------------------------

    private LinearLayout makeKeyRow(String[] labels, boolean letters) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        for (String label : labels) {
            row.addView(letters ? makeLetterKey(label) : makeTextKey(label));
        }
        return row;
    }

    private Button makeLetterKey(String letter) {
        Button key = makeKey(letter, 1f);
        key.setTag(letter);
        letterKeys.add(key);
        key.setOnClickListener(v -> {
            // A key released right after a hold gesture fired must not
            // also type itself into the text field.
            if (suppressKeys.remove(letter)) {
                v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                return;
            }
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            String text = shifted || capsLock ? letter.toUpperCase() : letter;
            commitText(text);
            if (shifted && !capsLock) {
                shifted = false;
                refreshLetterLabels();
            }
            updateSuggestions();
        });
        // Secret hold gestures (J+S, B+E, L+T) — track press/release.
        attachGestureTouch(key, letter);
        return key;
    }

    private Button makeTextKey(String text) {
        Button key = makeKey(text, 1f);
        key.setOnClickListener(v -> {
            // A number key released right after a hold gesture fired must
            // not also type itself into the text field (4+2 → 420 Room).
            if (suppressKeys.remove(text)) {
                v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                return;
            }
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            commitText(text);
            updateSuggestions();
        });
        // Secret hold gesture on the number row (4+2 → 420 Room).
        attachGestureTouch(key, text);
        return key;
    }

    /** A punctuation key: autocorrect the word it ends before committing. */
    private Button makePunctuationKey(String text) {
        Button key = makeKey(text, 1f);
        key.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            autocorrectCurrentWord();
            commitText(text);
            updateSuggestions();
        });
        return key;
    }

    private Button makeBackspaceKey(float weight) {
        Button backspace = makeKey("\u232B", weight);
        backspace.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            deleteChar();
            updateSuggestions();
        });
        backspace.setOnLongClickListener(v -> {
            backspaceHandler.postDelayed(backspaceRepeater, BACKSPACE_REPEAT_DELAY_MS);
            return true;
        });
        backspace.setOnTouchListener((v, event) -> {
            if (event.getAction() == android.view.MotionEvent.ACTION_UP
                    || event.getAction() == android.view.MotionEvent.ACTION_CANCEL) {
                backspaceHandler.removeCallbacks(backspaceRepeater);
                updateSuggestions();
            }
            return false;
        });
        return backspace;
    }

    private Button makeKey(String label, float weight) {
        Button key = new Button(this);
        key.setText(label);
        key.setTextSize(18);
        key.setTextColor(theme.text);
        key.setBackground(keyBackground(false));
        key.setAllCaps(false);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                0, dp(56), weight);
        int margin = dp(2);
        params.setMargins(margin, margin, margin, margin);
        key.setLayoutParams(params);
        return key;
    }

    private void refreshLetterLabels() {
        boolean upper = shifted || capsLock;
        for (Button key : letterKeys) {
            Object tag = key.getTag();
            if (tag instanceof String) {
                key.setText(upper ? ((String) tag).toUpperCase() : (String) tag);
            }
        }
        if (shiftKey != null) {
            boolean active = shifted || capsLock;
            shiftKey.setBackground(keyBackground(active));
            shiftKey.setTextColor(active ? theme.accentInk : theme.text);
        }
    }

    private void onShiftTap() {
        if (capsLock) {
            capsLock = false;
            shifted = false;
        } else if (shifted) {
            // Second tap while shifted = caps lock.
            shifted = false;
            capsLock = true;
        } else {
            shifted = true;
        }
        refreshLetterLabels();
    }

    // ------------------------------------------------------------------
    // Words: suggestions, autocorrect, learning
    // ------------------------------------------------------------------

    /** The word being typed right now (letters before the cursor). */
    private String currentWord() {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return "";
        CharSequence before = ic.getTextBeforeCursor(50, 0);
        if (before == null) return "";
        String text = before.toString();
        int i = text.length();
        while (i > 0) {
            char c = text.charAt(i - 1);
            if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '\'') i--;
            else break;
        }
        return text.substring(i);
    }

    private void updateSuggestions() {
        if (suggestionBar == null) return;
        String word = currentWord();
        List<String> suggestions = word.length() >= 2
                ? wordEngine.suggest(word)
                : new ArrayList<>();
        for (int i = 0; i < suggestionViews.size(); i++) {
            TextView view = suggestionViews.get(i);
            if (i < suggestions.size()) {
                view.setText(suggestions.get(i));
                view.setVisibility(View.VISIBLE);
            } else {
                view.setText("");
                view.setVisibility(View.INVISIBLE);
            }
        }
    }

    private void acceptSuggestion(int index) {
        String word = currentWord();
        List<String> suggestions = word.length() >= 2
                ? wordEngine.suggest(word)
                : new ArrayList<>();
        if (index >= suggestions.size() || word.isEmpty()) return;
        String picked = suggestions.get(index);
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        ic.deleteSurroundingText(word.length(), 0);
        ic.commitText(picked + " ", 1);
        wordEngine.noteCommittedWord(picked);
        updateSuggestions();
    }

    /** Fix the word being typed when it is a clear typo (a dictionary word
     *  one edit away). Returns true when a correction was made. */
    private boolean autocorrectCurrentWord() {
        String word = currentWord();
        if (word.length() < 3) return false;
        String fix = wordEngine.correct(word);
        if (fix == null || fix.equalsIgnoreCase(word)) return false;
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return false;
        // Keep the user's capitalisation (a leading capital stays capital).
        if (Character.isUpperCase(word.charAt(0))) {
            fix = Character.toUpperCase(fix.charAt(0)) + fix.substring(1);
        }
        ic.deleteSurroundingText(word.length(), 0);
        ic.commitText(fix, 1);
        return true;
    }

    /** Space ends a word: autocorrect it, note it (learning), then the space. */
    private void onSpace() {
        String word = currentWord();
        autocorrectCurrentWord();
        if (!word.isEmpty()) wordEngine.noteCommittedWord(word);
        commitText(" ");
        updateSuggestions();
    }

    /** Enter does the editor's action (Go / Search / Send / Done) when one
     *  is set, otherwise it is a plain newline. Autocorrects first. */
    private void onEnter() {
        autocorrectCurrentWord();
        EditorInfo info = getCurrentInputEditorInfo();
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        int action = info != null ? (info.imeOptions & EditorInfo.IME_MASK_ACTION) : EditorInfo.IME_ACTION_NONE;
        if (action == EditorInfo.IME_ACTION_GO
                || action == EditorInfo.IME_ACTION_SEARCH
                || action == EditorInfo.IME_ACTION_SEND
                || action == EditorInfo.IME_ACTION_DONE
                || action == EditorInfo.IME_ACTION_NEXT) {
            ic.performEditorAction(action);
        } else {
            ic.commitText("\n", 1);
        }
        updateSuggestions();
    }

    private void updateEnterLabel(EditorInfo info) {
        if (enterKey == null) return;
        int action = info != null ? (info.imeOptions & EditorInfo.IME_MASK_ACTION) : EditorInfo.IME_ACTION_NONE;
        String label = "\u23CE";
        if (action == EditorInfo.IME_ACTION_GO) label = "Go";
        else if (action == EditorInfo.IME_ACTION_SEARCH) label = "Search";
        else if (action == EditorInfo.IME_ACTION_SEND) label = "Send";
        else if (action == EditorInfo.IME_ACTION_DONE) label = "Done";
        else if (action == EditorInfo.IME_ACTION_NEXT) label = "Next";
        enterKey.setText(label);
    }

    private void commitText(String text) {
        InputConnection ic = getCurrentInputConnection();
        if (ic != null) ic.commitText(text, 1);
    }

    private void deleteChar() {
        InputConnection ic = getCurrentInputConnection();
        if (ic != null) ic.deleteSurroundingText(1, 0);
    }

    private void openBudEApp() {
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (intent == null) return;
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }

    /** Secret hold gesture: open the app straight into a hidden section
     *  (the tab id, read by the app via launch info). "lit" is not a tab —
     *  the app reads it as "toggle Lit Mode". */
    private void openTab(String tab) {
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (intent == null) return;
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra(BudELaunchInfo.EXTRA_TAB, tab);
        startActivity(intent);
    }

    /** Every app with a home-screen icon on this phone, A–Z by name.
     *  Loaded once and cached. Needs the LAUNCHER <queries> entry in the
     *  manifest (Android 11+ package visibility). */
    private List<android.content.pm.ResolveInfo> getLauncherApps() {
        if (launcherApps != null) return launcherApps;
        List<android.content.pm.ResolveInfo> apps = new ArrayList<>();
        try {
            Intent main = new Intent(Intent.ACTION_MAIN);
            main.addCategory(Intent.CATEGORY_LAUNCHER);
            apps = getPackageManager().queryIntentActivities(main, 0);
            final android.content.pm.PackageManager pm = getPackageManager();
            java.util.Collections.sort(apps, (a, b) -> {
                CharSequence la = a.loadLabel(pm);
                CharSequence lb = b.loadLabel(pm);
                return String.valueOf(la).compareToIgnoreCase(String.valueOf(lb));
            });
        } catch (Exception ignored) {
            // No list — the Apps tab shows its empty message.
        }
        launcherApps = apps;
        return launcherApps;
    }

    /** Open any app from the keyboard, the same way the leaf opens Bud-E. */
    private void openApp(String packageName) {
        Intent intent = getPackageManager().getLaunchIntentForPackage(packageName);
        if (intent == null) {
            Toast.makeText(this, "That app can't be opened from here.", Toast.LENGTH_SHORT).show();
            return;
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }

    // ------------------------------------------------------------------
    // Voice typing (SpeechRecognizer)
    // ------------------------------------------------------------------

    private void toggleVoice() {
        if (listening) {
            stopVoice();
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Allow the microphone for Bud-E first — open the app and try voice chat once.", Toast.LENGTH_LONG).show();
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Toast.makeText(this, "Voice typing isn't available on this phone.", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {}
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onEvent(int eventType, Bundle params) {}

            @Override
            public void onResults(Bundle results) {
                ArrayList<String> heard = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (heard != null && !heard.isEmpty()) {
                    String text = heard.get(0);
                    if (text != null && !text.isEmpty()) {
                        commitText(text + " ");
                        updateSuggestions();
                    }
                }
                stopVoice();
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                // Partials change as you talk — only final results get typed.
            }

            @Override
            public void onError(int error) {
                if (error != SpeechRecognizer.ERROR_NO_MATCH
                        && error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    Toast.makeText(BudEKeyboardService.this, "Didn't catch that — try again.", Toast.LENGTH_SHORT).show();
                }
                stopVoice();
            }
        });
        try {
            speechRecognizer.startListening(intent);
            listening = true;
            setMicListening(true);
        } catch (Exception e) {
            stopVoice();
            Toast.makeText(this, "Voice typing didn't start — try again.", Toast.LENGTH_SHORT).show();
        }
    }

    private void stopVoice() {
        listening = false;
        setMicListening(false);
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
                speechRecognizer.destroy();
            } catch (Exception ignored) {
            }
            speechRecognizer = null;
        }
    }

    private void setMicListening(boolean on) {
        if (micKey == null) return;
        micKey.setBackground(keyBackground(on));
        micKey.setTextColor(on ? theme.accentInk : theme.text);
    }

    // ------------------------------------------------------------------
    // Stickers (commitContent, API 25+)
    // ------------------------------------------------------------------

    /** Send one sticker image to the app being typed in. Returns false when
     *  the target does not accept images — the caller toasts instead. */
    private boolean sendSticker(String assetName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
            Toast.makeText(this, "Stickers need a newer Android — this phone is too old for them.", Toast.LENGTH_SHORT).show();
            return false;
        }
        InputConnection ic = getCurrentInputConnection();
        EditorInfo info = getCurrentInputEditorInfo();
        if (ic == null || info == null) return false;
        boolean supported = false;
        if (info.contentMimeTypes != null) {
            for (String mime : info.contentMimeTypes) {
                if ("image/png".equals(mime) || "image/*".equals(mime)) {
                    supported = true;
                    break;
                }
            }
        }
        if (!supported) {
            Toast.makeText(this, "This app doesn't take stickers — try it in your messages app.", Toast.LENGTH_SHORT).show();
            return false;
        }
        try {
            File dir = new File(getCacheDir(), "stickers");
            if (!dir.exists()) dir.mkdirs();
            File file = new File(dir, assetName.substring(assetName.lastIndexOf('/') + 1));
            if (!file.exists()) {
                try (InputStream in = getAssets().open(assetName);
                     FileOutputStream out = new FileOutputStream(file)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                }
            }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
            ClipDescription desc = new ClipDescription("Bud-E sticker", new String[]{"image/png"});
            InputContentInfo content = new InputContentInfo(uri, desc, null);
            if (info.packageName != null) {
                grantUriPermission(info.packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            return ic.commitContent(content, 0, null);
        } catch (Exception e) {
            Toast.makeText(this, "That sticker didn't send — try again.", Toast.LENGTH_SHORT).show();
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Nav bar
    // ------------------------------------------------------------------

    /** Hide the Android nav bar while the keyboard is up, so it never
     *  covers the bottom row. Swipe up from the bottom edge brings it back
     *  for a moment (transient), then it hides again. On Android 10+ this
     *  uses WindowInsetsController; older phones use the sticky-immersive
     *  flags. The insets listener above is the safety net: if the bar is
     *  visible anyway, the keyboard pads up above it. */
    private void hideNavigationBar() {
        try {
            View decor = getWindow().getWindow().getDecorView();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.view.WindowInsetsController controller = decor.getWindowInsetsController();
                if (controller != null) {
                    controller.hide(android.view.WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(
                            android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                decor.setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
            }
        } catch (Exception ignored) {
            // Hiding is best-effort — the insets padding still keeps the
            // bottom row clear when the bar stays visible.
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
