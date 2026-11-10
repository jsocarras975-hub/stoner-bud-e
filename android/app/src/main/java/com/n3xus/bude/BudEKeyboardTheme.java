package com.n3xus.bude;

/**
 * The Bud-E Keyboard follows the app's theme (Settings → Appearance).
 * Colors are the same values as src/styles.css (html[data-theme]).
 * The web app pushes the current theme id into SharedPreferences via
 * BudEKeyboardPlugin.setTheme whenever it changes; the keyboard reads it
 * each time it opens. Unknown ids fall back to night garden.
 */
public class BudEKeyboardTheme {

    public final int bg;
    public final int key;
    public final int keyPressed;
    public final int text;
    public final int muted;
    public final int accent;
    public final int accentInk;

    private BudEKeyboardTheme(int bg, int key, int keyPressed, int text, int muted, int accent, int accentInk) {
        this.bg = bg;
        this.key = key;
        this.keyPressed = keyPressed;
        this.text = text;
        this.muted = muted;
        this.accent = accent;
        this.accentInk = accentInk;
    }

    public static BudEKeyboardTheme forId(String id) {
        if ("day".equals(id)) {
            return new BudEKeyboardTheme(0xFFF4F1E4, 0xFFE7F0DC, 0xFFD5E4C4, 0xFF142107, 0xFF3E5340, 0xFF1F5C28, 0xFFF7F3E6);
        }
        if ("ember".equals(id)) {
            return new BudEKeyboardTheme(0xFF140C08, 0xFF2C1A12, 0xFF3C2418, 0xFFF8EFE4, 0xFFD4BBA6, 0xFFF0A04B, 0xFF1C0E06);
        }
        if ("moon".equals(id)) {
            return new BudEKeyboardTheme(0xFF070D14, 0xFF152433, 0xFF1C3044, 0xFFEEF4F8, 0xFFB7C9D6, 0xFF7DDEC8, 0xFF04221C);
        }
        if ("forest".equals(id)) {
            return new BudEKeyboardTheme(0xFF040A07, 0xFF0F2218, 0xFF163024, 0xFFE8F0E4, 0xFF9AB39A, 0xFF8BC34A, 0xFF0A1406);
        }
        if ("sunset".equals(id)) {
            return new BudEKeyboardTheme(0xFF14080C, 0xFF2C1620, 0xFF3C202C, 0xFFF8EEE8, 0xFFD4B8B0, 0xFFFF8A65, 0xFF1C0C08);
        }
        if ("kartoon".equals(id)) {
            return new BudEKeyboardTheme(0xFF0D0618, 0xFF1E1238, 0xFF281A4A, 0xFFF2EEFC, 0xFFC3B3E8, 0xFFC6F25C, 0xFF142107);
        }
        // night (default)
        return new BudEKeyboardTheme(0xFF07110C, 0xFF163024, 0xFF1D3B2B, 0xFFF3F6EA, 0xFFB7CBB0, 0xFFC6F25C, 0xFF142107);
    }
}
