package com.n3xus.bude;

import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.service.voice.VoiceInteractionSessionService;

/**
 * Creates one BudESession each time Android asks for an assist session
 * (long-press home, corner swipe, or the assistant being invoked).
 * Declared in the manifest and referenced from res/xml/voice_interaction_service.xml.
 */
public class BudESessionService extends VoiceInteractionSessionService {
    @Override
    public VoiceInteractionSession onNewSession(Bundle args) {
        return new BudESession(this);
    }
}
