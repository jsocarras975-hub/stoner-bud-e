package com.n3xus.bude;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Word predictions + autocorrect for the Bud-E Keyboard.
 *
 * Dictionary: the 10,000 most common English words, in frequency order
 * (assets/words.txt, from the public google-10000-english list). Loaded
 * once, lazily, on first use.
 *
 * - suggest(prefix): the top completions for what is being typed, most
 *   frequent first (the list order IS the frequency order, so the first
 *   matches win and the scan stops early).
 * - correct(word): Norvig-style spell check — if the word is in the
 *   dictionary it stands; otherwise the most frequent dictionary word at
 *   edit distance 1 wins (covers a missing, swapped, or wrong letter).
 *   Returns null when there is no good correction, so a real word the
 *   dictionary does not know is never "fixed" into something wrong.
 * - User words: a word the user types twice that the dictionary does not
 *   know is learned into a personal dictionary (SharedPreferences), so
 *   names and slang start completing too. One-off typos are never learned
 *   (they only get one strike).
 */
public class BudEWordEngine {

    private static final String PREFS = "bude-keyboard-prefs";
    private static final String USER_WORDS_KEY = "user-words";
    private static final int MAX_SUGGESTIONS = 3;
    private static final int MIN_WORD_LEN = 2;

    private static BudEWordEngine instance;

    private final Context context;
    private List<String> words;                 // frequency order
    private Map<String, Integer> rank;          // word -> index (lower = more frequent)
    private Set<String> dict;                   // fast membership
    private Set<String> userWords;              // learned, persisted
    private final Set<String> seenOnce = new HashSet<>(); // one strike, in-memory only
    private boolean loaded = false;

    public static synchronized BudEWordEngine get(Context context) {
        if (instance == null) instance = new BudEWordEngine(context.getApplicationContext());
        return instance;
    }

    private BudEWordEngine(Context context) {
        this.context = context;
    }

    /** Load the dictionary (once). Safe to call from any thread; the
     *  first call does the file read, later calls are a no-op. */
    public synchronized void ensureLoaded() {
        if (loaded) return;
        List<String> list = new ArrayList<>();
        try (InputStream in = context.getAssets().open("words.txt");
             BufferedReader reader = new BufferedReader(new InputStreamReader(in))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String w = line.trim().toLowerCase();
                if (!w.isEmpty()) list.add(w);
            }
        } catch (Exception ignored) {
            // No dictionary — predictions just stay empty.
        }
        words = list;
        rank = new HashMap<>(list.size() * 2);
        dict = new HashSet<>(list.size() * 2);
        for (int i = 0; i < list.size(); i++) {
            rank.put(list.get(i), i);
            dict.add(list.get(i));
        }
        userWords = new HashSet<>(loadUserWords());
        loaded = true;
    }

    private Set<String> loadUserWords() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return new HashSet<>(prefs.getStringSet(USER_WORDS_KEY, Collections.emptySet()));
    }

    private void saveUserWords() {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putStringSet(USER_WORDS_KEY, new HashSet<>(userWords))
                .apply();
    }

    public boolean isWord(String word) {
        ensureLoaded();
        String w = word.toLowerCase();
        return dict.contains(w) || userWords.contains(w);
    }

    /** Top completions for the prefix being typed (most frequent first).
     *  User words come first — they are personal, so they win ties. */
    public List<String> suggest(String prefix) {
        ensureLoaded();
        String p = prefix.toLowerCase();
        if (p.length() < MIN_WORD_LEN) return Collections.emptyList();
        List<String> out = new ArrayList<>(MAX_SUGGESTIONS);
        for (String w : userWords) {
            if (w.startsWith(p)) {
                out.add(w);
                if (out.size() >= MAX_SUGGESTIONS) return out;
            }
        }
        for (String w : words) {
            if (w.startsWith(p)) {
                out.add(w);
                if (out.size() >= MAX_SUGGESTIONS) break;
            }
        }
        return out;
    }

    /** The best correction for a word, or null when there is none. */
    public String correct(String word) {
        ensureLoaded();
        String w = word.toLowerCase();
        if (w.isEmpty() || dict.contains(w) || userWords.contains(w)) return null;
        String best = null;
        int bestRank = Integer.MAX_VALUE;
        for (String candidate : edits1(w)) {
            Integer r = rank.get(candidate);
            if (r != null && r < bestRank) {
                bestRank = r;
                best = candidate;
            }
        }
        if (best != null) return best;
        // Also check user words at edit distance 1.
        for (String candidate : edits1(w)) {
            if (userWords.contains(candidate)) return candidate;
        }
        return null;
    }

    /** Call when the user commits a word (space / enter / punctuation).
     *  A non-dictionary word typed twice is learned. Returns true when
     *  the word was just learned. */
    public boolean noteCommittedWord(String word) {
        ensureLoaded();
        String w = word.toLowerCase();
        if (w.length() < 3 || dict.contains(w) || userWords.contains(w)) return false;
        if (!w.matches("[a-z]+")) return false;
        if (seenOnce.contains(w)) {
            seenOnce.remove(w);
            userWords.add(w);
            saveUserWords();
            return true;
        }
        seenOnce.add(w);
        return false;
    }

    /** All strings at edit distance 1 (delete / transpose / replace /
     *  insert). The classic Norvig spell-checker set. */
    private static Set<String> edits1(String word) {
        Set<String> out = new HashSet<>();
        int n = word.length();
        for (int i = 0; i < n; i++) {
            out.add(word.substring(0, i) + word.substring(i + 1)); // delete
        }
        for (int i = 0; i < n - 1; i++) {
            out.add(word.substring(0, i) + word.charAt(i + 1) + word.charAt(i)
                    + word.substring(i + 2)); // transpose
        }
        for (int i = 0; i < n; i++) {
            for (char c = 'a'; c <= 'z'; c++) {
                out.add(word.substring(0, i) + c + word.substring(i + 1)); // replace
            }
        }
        for (int i = 0; i <= n; i++) {
            for (char c = 'a'; c <= 'z'; c++) {
                out.add(word.substring(0, i) + c + word.substring(i)); // insert
            }
        }
        return out;
    }
}
