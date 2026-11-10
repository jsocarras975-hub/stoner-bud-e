package com.n3xus.bude;

import android.content.ClipDescription;
import android.content.Intent;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputContentInfo;
import android.inputmethodservice.InputMethodService;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Bud-E Keyboard — an Android input method (IME) that lives in the same
 * Bud-E app and APK. QWERTY letters + a symbols page + a sticker tab with
 * his 20 stickers, and a leaf key that jumps into the Bud-E app.
 *
 * The user turns it on in Settings (see BudEKeyboardPlugin + the Keyboard
 * row in the app's Settings tab): Android makes the user pick the keyboard
 * — an app can never set itself as the default. Stickers go out with
 * InputConnection.commitContent (API 25+), so they only land in apps that
 * accept image input (messaging apps mostly do); anywhere else the keyboard
 * says so instead of failing quietly. No autocorrect or predictions in v1 —
 * that is the actually hard part, and it is parked on purpose.
 */
public class BudEKeyboardService extends InputMethodService {

    private static final int STICKER_COUNT = 20;
    private static final String STICKER_ASSET_PREFIX = "public/stickers/match-";
    private static final long BACKSPACE_REPEAT_DELAY_MS = 350;
    private static final long BACKSPACE_REPEAT_INTERVAL_MS = 60;

    private enum Mode { LETTERS, SYMBOLS, STICKERS }

    private Mode mode = Mode.LETTERS;
    private boolean shifted = false;   // one-shot shift: next letter only
    private boolean capsLock = false;  // double-tap shift locks caps

    private FrameLayout modeContainer;
    private final List<Button> letterKeys = new ArrayList<>();
    private Button shiftKey;
    private Button enterKey;

    private final Handler backspaceHandler = new Handler(Looper.getMainLooper());
    private final Runnable backspaceRepeater = new Runnable() {
        @Override
        public void run() {
            deleteChar();
            backspaceHandler.postDelayed(this, BACKSPACE_REPEAT_INTERVAL_MS);
        }
    };

    // ------------------------------------------------------------------
    // InputMethodService
    // ------------------------------------------------------------------

    @Override
    public View onCreateInputView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF07110C);
        int pad = dp(4);
        root.setPadding(pad, pad, pad, pad);

        // A thin top strip: the leaf + "Bud-E" on the left, a hide key on
        // the right (the system back button also hides it).
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText("\uD83C\uDF43 Bud-E");
        title.setTextColor(0xFFC6F25C);
        title.setTextSize(14);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        top.addView(title, titleParams);
        Button hide = makeKey("\u25BC", 1f);
        hide.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            requestHideSelf(0);
        });
        top.addView(hide);
        root.addView(top);

        modeContainer = new FrameLayout(this);
        root.addView(modeContainer, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        showMode(mode);
        return root;
    }

    @Override
    public void onStartInputView(EditorInfo info, boolean restarting) {
        super.onStartInputView(info, restarting);
        // Fresh open = back to letters, shift off.
        mode = Mode.LETTERS;
        shifted = false;
        capsLock = false;
        showMode(mode);
        updateEnterLabel(info);
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
        } else if (next == Mode.STICKERS) {
            view = buildStickersView();
        } else {
            view = buildLettersView();
        }
        modeContainer.addView(view);
        refreshLetterLabels();
    }

    private View buildLettersView() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
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
        Button backspace = makeKey("\u232B", 1.4f);
        backspace.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            deleteChar();
        });
        backspace.setOnLongClickListener(v -> {
            backspaceHandler.postDelayed(backspaceRepeater, BACKSPACE_REPEAT_DELAY_MS);
            return true;
        });
        backspace.setOnTouchListener((v, event) -> {
            if (event.getAction() == android.view.MotionEvent.ACTION_UP
                    || event.getAction() == android.view.MotionEvent.ACTION_CANCEL) {
                backspaceHandler.removeCallbacks(backspaceRepeater);
            }
            return false;
        });
        row3.addView(backspace);
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
            row3.addView(makeTextKey(s));
        }
        Button backspace = makeKey("\u232B", 1.2f);
        backspace.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            deleteChar();
        });
        row3.addView(backspace);
        col.addView(row3);
        col.addView(makeBottomRow(true));
        return col;
    }

    /** The sticker grid: his 20 stickers, 4 across, scrollable. */
    private View buildStickersView() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        ScrollView scroll = new ScrollView(this);
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        grid.setUseDefaultMargins(false);
        int gap = dp(6);
        grid.setPadding(gap, gap, gap, gap);
        AssetManager assets = getAssets();
        for (int i = 1; i <= STICKER_COUNT; i++) {
            String assetName = STICKER_ASSET_PREFIX + String.format("%02d", i) + ".png";
            ImageButton btn = new ImageButton(this);
            btn.setBackgroundResource(R.drawable.bude_key_bg);
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
        scroll.addView(grid);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(220));
        col.addView(scroll, scrollParams);
        col.addView(makeBottomRow(false));
        return col;
    }

    /** Bottom row: [?123 / ABC] [sticker] [space] [Bud-E leaf] [enter]. */
    private LinearLayout makeBottomRow(boolean onSymbols) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button modeKey = makeKey(onSymbols ? "ABC" : "?123", 1.2f);
        modeKey.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            showMode(onSymbols ? Mode.LETTERS : Mode.SYMBOLS);
        });
        row.addView(modeKey);
        Button stickerKey = makeKey("\uD83C\uDF43", 1f);
        stickerKey.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            showMode(mode == Mode.STICKERS ? Mode.LETTERS : Mode.STICKERS);
        });
        row.addView(stickerKey);
        Button space = makeKey("space", 3.4f);
        space.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            commitText(" ");
        });
        row.addView(space);
        Button bude = makeKey("\uD83C\uDF43", 1f);
        bude.setBackgroundResource(R.drawable.bude_key_accent_bg);
        bude.setTextColor(0xFF07110C);
        bude.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            openBudEApp();
        });
        row.addView(bude);
        enterKey = makeKey("\u23CE", 1.4f);
        enterKey.setBackgroundResource(R.drawable.bude_key_accent_bg);
        enterKey.setTextColor(0xFF07110C);
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
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            String text = shifted || capsLock ? letter.toUpperCase() : letter;
            commitText(text);
            if (shifted && !capsLock) {
                shifted = false;
                refreshLetterLabels();
            }
        });
        return key;
    }

    private Button makeTextKey(String text) {
        Button key = makeKey(text, 1f);
        key.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            commitText(text);
        });
        return key;
    }

    private Button makeKey(String label, float weight) {
        Button key = new Button(this);
        key.setText(label);
        key.setTextSize(18);
        key.setTextColor(0xFFF2F0EB);
        key.setBackgroundResource(R.drawable.bude_key_bg);
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
            shiftKey.setBackgroundResource(
                    (shifted || capsLock) ? R.drawable.bude_key_accent_bg : R.drawable.bude_key_bg);
            shiftKey.setTextColor((shifted || capsLock) ? 0xFF07110C : 0xFFF2F0EB);
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

    /** Enter does the editor's action (Go / Search / Send / Done) when one
     *  is set, otherwise it is a plain newline. */
    private void onEnter() {
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

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
