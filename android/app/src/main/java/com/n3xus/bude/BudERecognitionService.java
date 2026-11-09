package com.n3xus.bude;

import android.content.Intent;
import android.os.Bundle;
import android.os.RemoteException;
import android.speech.RecognitionListener;
import android.speech.RecognitionService;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import java.util.ArrayList;

/**
 * Bud-E's recognition service. Android requires every assistant to declare
 * one (VoiceInteractionServiceInfo refuses a service with no
 * recognitionService), and the system uses it for voice input.
 *
 * It forwards to the phone's built-in speech recognizer and passes the
 * results back through the RecognitionService.Callback. It does no network
 * work and keeps no state between calls.
 */
public class BudERecognitionService extends RecognitionService {
    private static final String TAG = "BudEAssistant";

    private SpeechRecognizer recognizer;
    private Callback activeCallback;

    @Override
    protected void onStartListening(Intent recognizerIntent, Callback listener) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            try {
                listener.error(SpeechRecognizer.ERROR_CLIENT);
            } catch (RemoteException ignored) {
                // The caller is gone; nothing to report to.
            }
            return;
        }
        stopActiveRecognizer();
        activeCallback = listener;
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                callReady(params);
            }

            @Override
            public void onBeginningOfSpeech() {
                callBegin();
            }

            @Override
            public void onRmsChanged(float rmsdB) {
                callRms(rmsdB);
            }

            @Override
            public void onBufferReceived(byte[] buffer) {
                // Audio bytes are not forwarded; results carry the transcript.
            }

            @Override
            public void onEndOfSpeech() {
                callEnd();
            }

            @Override
            public void onError(int error) {
                callError(error);
            }

            @Override
            public void onResults(Bundle results) {
                callResults(results);
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                callPartial(partialResults);
            }

            @Override
            public void onEvent(int eventType, Bundle params) {
                // No vendor events to forward.
            }
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        String language = recognizerIntent.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE);
        if (language != null && !language.isEmpty()) {
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        }
        recognizer.startListening(intent);
    }

    @Override
    protected void onStopListening(Callback listener) {
        if (recognizer != null) {
            recognizer.stopListening();
        }
    }

    @Override
    protected void onCancel(Callback listener) {
        stopActiveRecognizer();
    }

    @Override
    public void onDestroy() {
        stopActiveRecognizer();
        super.onDestroy();
    }

    private void stopActiveRecognizer() {
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
        activeCallback = null;
    }

    // Each callback call can throw RemoteException when the caller is gone;
    // swallow it — there is nobody left to tell.

    private void callReady(Bundle params) {
        try {
            if (activeCallback != null) activeCallback.readyForSpeech(params);
        } catch (RemoteException ignored) {
        }
    }

    private void callBegin() {
        try {
            if (activeCallback != null) activeCallback.beginningOfSpeech();
        } catch (RemoteException ignored) {
        }
    }

    private void callRms(float rmsdB) {
        try {
            if (activeCallback != null) activeCallback.rmsChanged(rmsdB);
        } catch (RemoteException ignored) {
        }
    }

    private void callEnd() {
        try {
            if (activeCallback != null) activeCallback.endOfSpeech();
        } catch (RemoteException ignored) {
        }
    }

    private void callError(int error) {
        Log.i(TAG, "Recognition error: " + error);
        try {
            if (activeCallback != null) activeCallback.error(error);
        } catch (RemoteException ignored) {
        }
        stopActiveRecognizer();
    }

    private void callResults(Bundle results) {
        try {
            if (activeCallback != null) activeCallback.results(results);
        } catch (RemoteException ignored) {
        }
        stopActiveRecognizer();
    }

    private void callPartial(Bundle partialResults) {
        try {
            if (activeCallback != null) activeCallback.partialResults(partialResults);
        } catch (RemoteException ignored) {
        }
    }

    /** Best transcript from a results bundle, or null when there is none. */
    public static String bestResult(Bundle results) {
        if (results == null) return null;
        ArrayList<String> matches =
                results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return null;
        String best = matches.get(0);
        return best == null || best.trim().isEmpty() ? null : best.trim();
    }
}
