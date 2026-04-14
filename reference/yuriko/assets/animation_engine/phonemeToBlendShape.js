/**
 * Phoneme to VRM Blend Shape Mapping
 * Maps IPA phonemes to VRM expression blend shapes (aa, ih, ou, ee, oh)
 */

// Phoneme duration in milliseconds
export const PHONEME_DURATION = 100;

// Phoneme to blend shape mapping
// Each phoneme maps to one or more blend shapes with weights (0-1)
export const PHONEME_TO_BLEND_SHAPE = {
    // Vowels - Using ALL 5 VRM blend shapes (aa, ih, ou, ee, oh)
    'ə': { aa: 0.5, ih: 0.2 },   // schwa
    'æ': { aa: 0.7 },             // cat
    'a': { aa: 0.8 },             // father
    'ɑ': { aa: 1.0 },             // cot
    'ɒ': { oh: 0.8 },             // lot
    'ɔ': { oh: 1.0 },             // thought
    'o': { oh: 0.9 },             // go
    'ʊ': { ou: 0.7 },             // book
    'u': { ou: 1.0 },             // boot
    'ʌ': { aa: 0.5, oh: 0.3 },   // cup
    'ɪ': { ih: 0.6 },             // kit
    'i': { ee: 0.8, ih: 0.3 },   // fleece
    'e': { ee: 0.7, ih: 0.2 },   // face
    'ɛ': { ee: 0.6, ih: 0.3 },   // dress
    'ɜ': { aa: 0.5, oh: 0.3 },   // nurse (R-colored vowel)
    'ɐ': { aa: 0.6 },             // about

    // Consonants - Visible mouth movements (0.2-0.6 range)
    'f': { ih: 0.3 },
    'v': { ih: 0.3 },
    'θ': { ih: 0.4 },             // think
    'ð': { ih: 0.4 },             // this
    's': { ih: 0.4 },
    'z': { ee: 0.4 },
    'ʃ': { ou: 0.4 },             // ship
    'ʒ': { ou: 0.4 },             // measure
    't': { ih: 0.3 },
    'd': { ih: 0.3 },
    'n': { ih: 0.3 },
    'l': { ih: 0.3 },
    'ɹ': { ou: 0.4 },             // red
    'w': { ou: 0.6 },
    'j': { ee: 0.4 },             // yes

    // Bilabial consonants - mouth closure
    'p': { aa: 0.3 },
    'b': { aa: 0.3 },
    'm': { aa: 0.3 },

    // Velar consonants - back of mouth
    'k': { aa: 0.4 },
    'ɡ': { aa: 0.4 },
    'ŋ': { aa: 0.3 },             // sing

    // Other consonants
    'h': { aa: 0.2 },
    'ɾ': { ih: 0.3 },             // flap t (butter)
    'tʃ': { ou: 0.4 },            // church
    'dʒ': { ou: 0.4 }             // judge
};

/**
 * Get blend shape weights for a given phoneme
 * @param {string} phoneme - IPA phoneme symbol
 * @returns {Object} - Blend shape weights {aa, ih, ou, ee, oh}
 */
export function getBlendShapesForPhoneme(phoneme) {
    const mapping = PHONEME_TO_BLEND_SHAPE[phoneme];

    if (!mapping) {
        // Default to neutral (all zeros)
        return { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    }

    // Return full blend shape object with defaults for missing values
    return {
        aa: mapping.aa || 0,
        ih: mapping.ih || 0,
        ou: mapping.ou || 0,
        ee: mapping.ee || 0,
        oh: mapping.oh || 0
    };
}
