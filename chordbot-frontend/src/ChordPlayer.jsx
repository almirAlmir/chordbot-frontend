import * as Tone from 'tone';
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE_URL = '/api';

const getChordColor = (degree) => {
    switch(degree) {
        case 1: return '#3b82f6';
        case 4: return '#22c55e';
        case 5: return '#ef4444';
        case 6: return '#a855f7';
        default: return '#fbbf24';
    }
};

const PROGRESSION_OPTIONS = {
    'Progressão 1 (I-vi-IV-V)': [1, 6, 4, 5],
    'Progressão 2 (I-vi-ii-V)': [1, 6, 2, 5],
    'Progressão 3 (I-V-vi-iii-IV-I-IV-V)': [1, 5, 6, 3, 4, 1, 4, 5],
    'Progressão 4 (i-IV-v-III)': [1, 4, 5, 3] 
};
const DEFAULT_PROGRESSION_KEY = 'Progressão 1 (I-vi-IV-V)';

const ChordPlayer = () => {
    const playerRef = useRef(null);
    const loopRef = useRef(null);
    const mainOutputRef = useRef(null);

    const [isLoaded, setIsLoaded] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [config, setConfig] = useState({ progressao: [] });
    
    const [selectedProgressionKey, setSelectedProgressionKey] = useState(DEFAULT_PROGRESSION_KEY);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [startIndex, setStartIndex] = useState(0);
    const [endIndex, setEndIndex] = useState(null); 

    // --- 1. SETUP SYNTH ---
    const setupSynth = useCallback(async (timbreConfig) => {
        const mainOutput = new Tone.Volume(0).toDestination();
        mainOutputRef.current = mainOutput;

        const polySynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "triangle" },
            envelope: {
                attack: 0.02,
                decay: 0.1,
                sustain: 0.3,
                release: 0.01 
            },
            volume: -5
        });
        
        const reverb = new Tone.Reverb({ decay: 2.5, wet: 0.3 });
        polySynth.connect(reverb);
        reverb.connect(mainOutput);
        
        playerRef.current = polySynth;
        setIsLoaded(true);
        Tone.Transport.bpm.value = timbreConfig.BPM || 120;
    }, []);

    const handleProgressionChange = (event) => {
        const newKey = event.target.value;
        const newProgression = PROGRESSION_OPTIONS[newKey];
        
        // 1. Para o playback se estiver tocando
        if (isPlaying) {
            Tone.Transport.stop();
            if (loopRef.current) loopRef.current.dispose();
            loopRef.current = null;
            setIsPlaying(false);
        }

        // 2. Update de estados
        setSelectedProgressionKey(newKey);
        setConfig(prev => ({ ...prev, progressao: newProgression }));
        setActiveIndex(-1);
        setStartIndex(0);
        setEndIndex(null); 
    };

    // --- 2. FETCH LOGIC ---
    useEffect(() => {
        async function loadConfigAndSynth() {
            try {
                const timbreResponse = await fetch(`${API_BASE_URL}/timbre`);
                const timbreConfig = await timbreResponse.json();
                
                const progressao = PROGRESSION_OPTIONS[selectedProgressionKey]; 
                
                setConfig({ ...timbreConfig, progressao });
                await setupSynth({ ...timbreConfig, progressao });

            } catch (error) {
                console.error("API Error:", error);
                setIsLoaded(false); 
            }
        }
        loadConfigAndSynth();

        return () => {
            if (playerRef.current) playerRef.current.dispose();
            Tone.Transport.stop();
            Tone.Transport.cancel();
        };
    }, [setupSynth, selectedProgressionKey]);


    // --- 3. LOOP CONTROL ---
    const createAndStartLoop = useCallback((synth) => {
        if (!synth || loopRef.current) return;
        
        let chordIndex = startIndex;
        const progressionLength = config.progressao.length;

        const effectiveEndIndex = endIndex !== null ? endIndex : progressionLength - 1;
        
        const loopSteps = effectiveEndIndex >= startIndex 
            ? (effectiveEndIndex - startIndex + 1) 
            : (progressionLength - startIndex + effectiveEndIndex + 1);
        
        const chordDuration = config.TEMPO_ACORDE_SEGUNDOS;

        const progressionLoop = new Tone.Loop(async (time) => {
            synth.releaseAll();

            let relativeIndex = (chordIndex - startIndex) % loopSteps;
            let currentIndex = (startIndex + relativeIndex) % progressionLength;
            
            const grau = config.progressao[currentIndex];
            
            let mod = null;
            if (grau === 4) mod = 'maj7';
            else if (grau === 5) mod = 'sus4';
            
            try {
                let url = `${API_BASE_URL}/chord/${grau}`;
                if (mod) url += `?mod=${mod}`;
                
                const chordResponse = await fetch(url);
                const chordData = await chordResponse.json();
                
                if (chordData.status === 'success') {
                    const notes = chordData.notas_midi.map(n => Tone.Midi(n).toNote());
                    
                    const strumSpeed = 0.04;
                    const durationOfLastNote = chordDuration - (notes.length * strumSpeed) - 0.05; 

                    notes.forEach((note, i) => {
                        synth.triggerAttackRelease(
                            note, 
                            durationOfLastNote > 0 ? durationOfLastNote : 0.1, 
                            time + (i * strumSpeed), 
                            0.6 + Math.random() * 0.3
                        );
                    });

                    Tone.Draw.schedule(() => {
                        setActiveIndex(currentIndex);
                    }, time);
                }
            } catch (e) {
                console.error(e);
            }
            chordIndex++;
        }, chordDuration).start(0);

        loopRef.current = progressionLoop;
        
        progressionLoop.set({
            loop: true
        });

        Tone.Transport.start();

    }, [config, startIndex, endIndex]);


    // --- 4. PLAYBACK CONTROLS (Updated with restartPlay) ---

    const restartPlay = useCallback(() => {
        if (!playerRef.current) return;

        Tone.Transport.stop();
        Tone.Transport.cancel();
        playerRef.current.releaseAll();
        
        if (loopRef.current) {
            loopRef.current.dispose();
            loopRef.current = null;
        }

        Tone.Transport.scheduleOnce(() => {
            createAndStartLoop(playerRef.current);
            setIsPlaying(true); 
            mainOutputRef.current.volume.rampTo(0, 0.05);
        }, Tone.Transport.immediate());

    }, [createAndStartLoop]);

    const togglePlay = async () => {
        if (!isLoaded || !playerRef.current) return;

        if (Tone.context.state !== 'running') await Tone.start();
        
        if (!isPlaying) {
            mainOutputRef.current.volume.rampTo(0, 0.05);
            createAndStartLoop(playerRef.current);
            setIsPlaying(true);
        } else {
            // KILL SWITCH
            mainOutputRef.current.volume.rampTo(-Infinity, 0.01);
            Tone.Transport.stop();
            Tone.Transport.cancel();
            playerRef.current.releaseAll();
            
            if (loopRef.current) {
                loopRef.current.dispose();
                loopRef.current = null;
            }
            
            setIsPlaying(false);
            setActiveIndex(-1); 
        }
    };

    const clearLoopPoints = () => {
        setStartIndex(0);
        setEndIndex(null); 
        setActiveIndex(-1); 

        if (isPlaying) {
            restartPlay();
        }
    };

    // HANDLER: Lógica de keyboard modifiers
    const handleChordClick = (index, event) => {
        const isModifierClicked = event.metaKey || event.ctrlKey;

        if (isModifierClicked) {
            if (endIndex === index) {
                setEndIndex(null);
            } else {
                setEndIndex(index);
            }
        } else {
            setStartIndex(index);
        }

        if (isPlaying) {
            restartPlay();
        } else {
            setActiveIndex(-1);
        }
    };

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                clearLoopPoints();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [clearLoopPoints]);


    return (
        <div style={{ 
            fontFamily: 'sans-serif', 
            width: '100%', 
            padding: '40px', 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
        }}>
            <h1>ChordBot 🎸</h1>

            <div className="controls" style={{ width: '100%', maxWidth: '600px' }}>
                <label htmlFor="progression-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    Selecione uma progressão
                </label>
                <select 
                    id="progression-select" 
                    onChange={handleProgressionChange} 
                    value={selectedProgressionKey}
                    disabled={isPlaying}
                    style={{
                        padding: '10px', width: '100%', borderRadius: '6px',
                        border: '1px solid #ccc', fontSize: '16px'
                    }}
                >
                    {Object.keys(PROGRESSION_OPTIONS).map(key => (
                        <option key={key} value={key}>
                            {key}
                        </option>
                    ))}
                </select>
                <p style={{marginTop: '10px', fontSize: '14px', color: '#666'}}>
                    Clique em um bloco para definir o início do loop. Segure <span style={{fontWeight: 800}}>*Ctrl/Cmd*</span> e clique para definir/remover o fim do loop.
                </p>
            </div>
            
            <div style={{ 
                width: '100%', 
                maxWidth: '600px', 
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
            }}>
                
                <div
                    style={{
                        display: 'flex',
                        width: '100%',
                        justifyContent: 'end',
                        height: '20px'
                    }}
                >
                    {
                        endIndex !== null && (
                            <button 
                                onClick={clearLoopPoints} 
                                disabled={startIndex === 0 && endIndex === null}
                                style={{
                                    padding: '5px', fontSize: '12px',
                                    backgroundColor: '#3d4149ff',
                                    color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer',
                                }}
                            >
                                Limpar seleção
                            </button>
                        )
                    }
                </div>
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    width: '100%',
                    height: '100px',
                    justifyContent: 'space-between'
                }}>

                    {config.progressao && config.progressao.map((degree, index) => {
                        const isActive = isPlaying && index === activeIndex;
                        const isStartingPoint = index === startIndex;
                        const isEndPoint = index === endIndex;
                        const chordColor = getChordColor(degree);
                        
                        const isWithinLoop = endIndex === null || (startIndex <= endIndex ? (index >= startIndex && index <= endIndex) : (index >= startIndex || index <= endIndex));

                        return (
                            <div 
                            key={index} 
                            onClick={(event) => handleChordClick(index, event)} 
                            style={{
                                flex: 1,
                                borderRadius: '8px',
                                backgroundColor: isActive ? chordColor : (isWithinLoop ? '#cccccc' : '#e5e7eb'),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '24px',
                                fontWeight: 'bold',
                                color: isActive ? 'white' : (isWithinLoop ? '#333' : '#9ca3af'),
                                boxShadow: isActive ? `0 0 15px ${chordColor}80` : 'none',
                                transform: isActive ? 'scale(1.05)' : 'scale(1)',
                                transition: 'all 0.1s ease-in-out',
                                border: isStartingPoint ? `4px solid ${chordColor}` : (isEndPoint ? '4px solid #f97316' : '2px solid #f3f4f6'),
                                position: 'relative',
                                cursor: 'pointer',
                            }}>
                                {degree}
                                {isStartingPoint && (
                                    <span style={{
                                        position: 'absolute', top: '5px', left: '5px', 
                                        fontSize: '10px', fontWeight: 'normal', color: 'white', backgroundColor: chordColor, padding: '2px 4px', borderRadius: '4px'
                                    }}>INÍCIO</span>
                                )}
                                {isEndPoint && (
                                    <span style={{
                                        position: 'absolute', bottom: '5px', right: '5px', 
                                        fontSize: '10px', fontWeight: 'normal', color: 'white', backgroundColor: '#f97316', padding: '2px 4px', borderRadius: '4px'
                                    }}>FIM</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                    {/* Existing Play/Stop Button */}
                    <button 
                        onClick={togglePlay} 
                        disabled={!isLoaded}
                        style={{
                            flex: 1, padding: '15px', fontSize: '18px',
                            backgroundColor: isPlaying ? '#ef4444' : '#10b981',
                            color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer',
                        }}
                    >
                        {isPlaying ? '🛑 PARAR' : '▶ TOCAR'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChordPlayer;