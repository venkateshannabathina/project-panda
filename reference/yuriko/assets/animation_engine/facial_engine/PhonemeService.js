/**
 * PhonemeService - Extract phonemes from text for lip sync
 * Uses the phonemizer library to convert text to IPA phonemes
 */

/**
 * Extract phonemes from text
 * @param {string} text - Text to extract phonemes from
 * @returns {Promise<Array<string>>} - Array of phoneme strings
 */
export async function extractPhonemes(text) {
    try {
        // Check if phonemizer is available
        if (typeof phonemize === 'undefined') {
            console.warn('⚠️ Phonemizer library not loaded, using fallback');
            return _fallbackPhonemeExtraction(text);
        }

        // Use phonemizer library to extract phonemes
        const phonemeData = await phonemize(text, 'en-us');

        // phonemizer returns either an array or string
        const phonemeString = Array.isArray(phonemeData)
            ? phonemeData.join(' ')
            : String(phonemeData);

        // Split into individual phonemes
        const phonemes = phonemeString.split(/\s+/).filter(p => p.length > 0);

        console.log('🎵 Extracted phonemes:', phonemes.length, 'phonemes from', text);
        return phonemes;

    } catch (error) {
        console.error('❌ Phoneme extraction error:', error);
        return _fallbackPhonemeExtraction(text);
    }
}

/**
 * Fallback phoneme extraction when phonemizer isn't available
 * Uses simple vowel/consonant detection
 * @private
 */
function _fallbackPhonemeExtraction(text) {
    console.log('⚠️ Using fallback phoneme extraction');

    // Simple mapping: convert text to approximate phonemes
    const words = text.toLowerCase().split(/\s+/);
    const phonemes = [];

    for (const word of words) {
        // Very basic phoneme approximation
        for (let i = 0; i < word.length; i++) {
            const char = word[i];

            // Vowels
            if ('aeiou'.includes(char)) {
                if (char === 'a') phonemes.push('a');
                else if (char === 'e') phonemes.push('e');
                else if (char === 'i') phonemes.push('i');
                else if (char === 'o') phonemes.push('o');
                else if (char === 'u') phonemes.push('u');
            }
            // Common consonants
            else if (char === 't' || char === 'd') phonemes.push('t');
            else if (char === 's' || char === 'z') phonemes.push('s');
            else if (char === 'f' || char === 'v') phonemes.push('f');
            else if (char === 'p' || char === 'b') phonemes.push('p');
            else if (char === 'm') phonemes.push('m');
            else if (char === 'n') phonemes.push('n');
            else if (char === 'l') phonemes.push('l');
            else if (char === 'r') phonemes.push('ɹ');
            else if (char === 'w') phonemes.push('w');
        }
    }

    console.log('📝 Fallback phonemes:', phonemes);
    return phonemes;
}

/**
 * Extract phonemes synchronized with word boundaries
 * Returns phonemes mapped to words for better timing
 * @param {string} text - Text to extract phonemes from
 * @param {Array} wordBoundaries - Optional word boundary data from TTS
 * @returns {Promise<Object>} - {phonemes: Array, wordPhonemes: Array}
 */
export async function extractPhonemesWithTiming(text, wordBoundaries = null) {
    const phonemes = await extractPhonemes(text);

    if (!wordBoundaries || wordBoundaries.length === 0) {
        return {
            phonemes,
            wordPhonemes: null
        };
    }

    // Attempt to distribute phonemes across words
    const words = wordBoundaries.map(wb => wb.word);
    const phonemePerWord = Math.floor(phonemes.length / words.length);
    const wordPhonemes = [];

    for (let i = 0; i < words.length; i++) {
        const start = i * phonemePerWord;
        const end = (i === words.length - 1)
            ? phonemes.length
            : start + phonemePerWord;

        wordPhonemes.push({
            word: words[i],
            phonemes: phonemes.slice(start, end),
            ...wordBoundaries[i]
        });
    }

    return {
        phonemes,
        wordPhonemes
    };
}
