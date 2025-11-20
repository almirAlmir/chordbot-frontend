import * as Tone from 'tone';
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE_URL = '/api';

const ChordPlayer = () => {
    // aqui o useRef ta fazendo com que não algumas variaveis de audio nao re-renderize
    const playerRef = useRef(null);
    const loopRef = useRef(null);
    const effectsRef = useRef({});

    const [isLoaded, setIsLoaded] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [config, setConfig] = useState({});
    
    //SETUP DO SINTETIZADOR E EFEITOS DE AUDIO
    const setupSynth = useCallback(async (timbreConfig) => {
        //Criando o sintetizador 
        const polySynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: timbreConfig.forma_onda || "sawtooth" 
            },
            envelope: {
                attack: timbreConfig.envelope.attack,
                decay: timbreConfig.envelope.decay,
                sustain: timbreConfig.envelope.sustain,
                release: timbreConfig.envelope.release,
            },
            volume: -10 // Volume base
        });
        
        //Cadeia de efeitos, semelhante ao projeto anterior pq segue a mesma ideia
        const delay = new Tone.FeedbackDelay(timbreConfig.delay.time, timbreConfig.delay.feedback, timbreConfig.delay.mix).toDestination();
        const reverb = new Tone.Reverb({ 
            decay: timbreConfig.reverb.decay_time, 
            wet: timbreConfig.reverb.mix 
        }).connect(delay);
        
        // Conecta o sintetizador ao reverb
        polySynth.connect(reverb);
        
        playerRef.current = polySynth;
        effectsRef.current = { delay, reverb };
        
        setIsLoaded(true);
        Tone.Transport.bpm.value = timbreConfig.BPM || 120;
    }, []);

    // --- 2. FETCH DA LÓGICA E SETUP INICIAL ---
    useEffect(() => {
        async function loadConfigAndSynth() {
            try {
                // Fetch das configurações do timbre do Python
                const timbreResponse = await fetch(`${API_BASE_URL}/timbre`);
                const timbreConfig = await timbreResponse.json();
                
                // Fetch da progressão - A gente pode ajustar isso aqui pra ser mais dinamica
                const progressao = [1, 6, 4, 5]; 
                
                setConfig({ ...timbreConfig, progressao });
                await setupSynth({ ...timbreConfig, progressao });

            } catch (error) {
                console.error("Erro ao carregar a configuração da API:", error);
                // Se o backend não rodar exibe um erro no react
                setIsLoaded(false); 
            }
        }
        
        loadConfigAndSynth();

        return () => {
            if (playerRef.current) playerRef.current.dispose();
            Tone.Transport.stop();
        };
    }, [setupSynth]);


    // --- 3. CRIAÇÃO/CONTROLE DO LOOP QUE REPRODUZ ---
    const createAndStartLoop = useCallback((synth) => {
        if (!synth || loopRef.current) return;
        
        let chordIndex = 0;
        
        const progressionLoop = new Tone.Loop(async (time) => {
            
            const grau = config.progressao[chordIndex % config.progressao.length];
            let mod = null;
            
            // Lógica de Modulação (Seu código)
            if (grau === 4) { mod = 'maj7'; } 
            else if (grau === 5) { mod = 'sus4'; }
            
            // REQUISITANDO A API PELAS NOTAS MIDI
            let url = `${API_BASE_URL}/chord/${grau}`;
            if (mod) { url += `?mod=${mod}`; }
            
            const chordResponse = await fetch(url);
            const chordData = await chordResponse.json();
            
            if (chordData.status === 'success') {
                const notes = chordData.notas_midi;
                
                // DISPARANDO O SOM EM TEMPO REAL
                // '4n' = duração de uma nota de quarto //Posso tentar deixar essa parte mais explicativa
                synth.triggerAttackRelease(notes.map(n => Tone.Midi(n).toNote()), config.TEMPO_ACORDE_SEGUNDOS, time);
                console.log(`Grau ${grau} (${mod || 'triade'}): ${notes}`);
            }

            chordIndex++;

        }, config.TEMPO_ACORDE_SEGUNDOS).start(0); 

        loopRef.current = progressionLoop;
        Tone.Transport.start();

    }, [config]);


    const togglePlay = async () => {
        if (!isLoaded || !playerRef.current) {
            alert("Aguarde a API carregar ou verifique se o servidor Python está rodando.");
            return;
        }

        //Garantna de que o Web Audio está ativo após interação
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
        
        //Inicia e Para
        if (!isPlaying) {
            createAndStartLoop(playerRef.current);
            setIsPlaying(true);
        } else {
            Tone.Transport.stop();
            setIsPlaying(false);
        }
    };


    // --- RENDERIZAÇÃO DAS FUNCIONALIDADES---
    return (
        <div>
            <h1>ChordBot 🎸</h1>
            <p>Status: {isLoaded ? 'Pronto' : 'ERRO: API Flask não conectada.'}</p>
            <button onClick={togglePlay} disabled={!isLoaded}>
                {isPlaying ? 'Parar Loop' : 'Tocar Progressão'}
            </button>
            <p>BPM: {config.BPM || '120'} | Timbre: {config.FORMA_ONDA || '...'}</p>
            <p>Prog. Atual: I - vi - IVmaj7 - Vsus4</p>
        </div>
    );
};

export default ChordPlayer;