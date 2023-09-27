export namespace MagnitSynth
{
    
    export const NoteNames_ScientificNotation = 
    [
        'A',
        'A#', // G?
        'B',
        'C',
        'C#', // D?
        'D',
        'D#', // E?
        'E',
        'F',
        'F#', // G?
        'G',
        'G#', // A?
    ];
    export const NotesInOctave = 12;

    /**
     * Number of Keyboard Keys mapped to starting register offset
     */
    const Keyboard_LengthToStartOffsetMap = new Map<number, number>([
        [88, -48],
        [61, -33],
        [49, -21],
        [32, -9],
        [25, -9],
    ]);

    // distance (in registers; individual keys/pads) from A4 (register 69)
    export const MinimumSupportedRegisterDistance = -69;
    export const MaximumSupportedRegisterDistance = 143;

    // all "note frequency" references refer to the note's fundamental frequency in hertz
    export const A4Frequency = 440; /* concert pitch for tuning */
    export const MiddleCFrequency = 261.6256; /* middle C for marking and shifting */
    export const FrequencyTolerance = .3; // + or - from the pure frequency that will still be considered that frequency to account for sloppy sample assignment (and math errors?)
    export const MiddleC_LowTolerance = MiddleCFrequency - FrequencyTolerance;
    export const MiddleC_HighTolerance = MiddleCFrequency + FrequencyTolerance;

    export interface DigitalController extends HTMLElement
    {
        
    }
    
    export class ControllerContext
    {
        audioContext: AudioContext;
        mainVolumeGainNode: GainNode;
        activeNoteMap: Map<Instrument, Map<string,Map<Note, NoteProperties>>>;
        controllerInputRegistersMap: Map<string, Map<number, Register>>;

        // keybedRegisters: Map<number, Register>; // keybed is a dynamic index input; number of notes represented changes (88, 61, etc); 
        // padsRegisters: Map<number, Register>; // pads input is a static index input; number of notes represented is always the same: 10; 
    
        constructor()
        {
            this.audioContext = new AudioContext();
            this.mainVolumeGainNode = this.audioContext.createGain();
            this.mainVolumeGainNode.connect(this.audioContext.destination);
            this.controllerInputRegistersMap = new Map();
            // this.keybedRegisters = new Map();
            // this.padsRegisters = new Map();
            this.activeNoteMap = new Map();
        }

        findInputRegister(sectionKey: string, frequency: number)
        {
            const sectionInputs = this.controllerInputRegistersMap.get(sectionKey);
            if(sectionInputs == null) { throw new Error("Unknown ")}
            
            const lowTolerance = frequency - FrequencyTolerance;
            const highTolerance = frequency + FrequencyTolerance;
            let value = frequency;
            let foundRegister = null;
            for(const [currentFrequency, register] of sectionInputs)
            {
                if(currentFrequency == frequency) { foundRegister = register; break; }
                if(currentFrequency > lowTolerance && currentFrequency < highTolerance)
                {
                    foundRegister = register;
                    break;
                }
            }
            return foundRegister;
        }

        // findKeybedRegister(frequency: number)
        // {
            
        //     const lowTolerance = frequency - FrequencyTolerance;
        //     const highTolerance = frequency + FrequencyTolerance;
        //     let value = frequency;
        //     for(const [currentFrequency, message] of this.keybedRegisters)
        //     {
        //         if(currentFrequency == frequency) { break; }
        //         if(currentFrequency > lowTolerance && currentFrequency < highTolerance)
        //         {
        //             value = currentFrequency;
        //             break;
        //         }
        //     }
        //     return this.keybedRegisters.get(value);
        // }
        // findPadRegister(frequency: number)
        // {            
        //     const lowTolerance = frequency - FrequencyTolerance;
        //     const highTolerance = frequency + FrequencyTolerance;
        //     let value = frequency;
        //     for(const [currentFrequency, message] of this.padsRegisters)
        //     {
        //         if(currentFrequency == frequency) { break; }
        //         if(currentFrequency > lowTolerance && currentFrequency < highTolerance)
        //         {
        //             value = currentFrequency;
        //             break;
        //         }
        //     }
        //     return this.padsRegisters.get(value);
        // }

        findActiveNoteProperties(instrument: Instrument, note: Note)
        {
            const instrumentEntry = this.activeNoteMap.get(instrument);
            if(instrumentEntry == null) { return null; }

            const noteMap = instrumentEntry.get(note.mappingName);
            if(noteMap == null) { return null; }
    
            return noteMap.get(note);
        }
    }
    
    export class Note
    {
        triggerMethod: 'pointer'|'midi'|'glyphentry' = 'pointer';
        velocity: number = 0;
        playbackTimeout?: NodeJS.Timeout;

        get mappingName()
        {
            return this.name + this.octave.toString();
        }
    
        constructor(public name: string, public frequency: number, public octave: number)
        {
    
        }
    
        static fromMidiInput(data: any)
        {
            //todo;
            // return new Note();
        }
    }

    export class Sample
    {
        path: string;
        name: string;
        noteName: string;
        noteFrequency: number;
        noteVelocity: number;
        playbackSpeed: number = 1;

        dataBuffer?: ArrayBuffer;
        audioBuffer?: AudioBuffer;

        get isLoaded(): boolean
        {
            return this.dataBuffer != null;
        }

        constructor(path: string, noteName: string, noteFrequency: number, name: string = "")
        {
            this.path = path;
            this.name = name;
            this.noteName = noteName;
            this.noteFrequency = noteFrequency;

            const vIndex = this.name.indexOf('v')
            if(vIndex > -1)
            {
                const velocityString = this.name.substring(vIndex + 1, this.name.lastIndexOf('.'));
                this.noteVelocity = parseInt(velocityString);
            }
            else
            {
                this.noteVelocity = 7;
            }
        }

        async load(context: ControllerContext)
        {
            if(this.isLoaded == true) { console.log('skipped load'); return; }
            const resourcePath = new URL(this.path).href;
            const idbResponse = await loadFromCache(resourcePath) as any;
            if(idbResponse != null)
            {
                this.dataBuffer = idbResponse.value as ArrayBuffer;
            }
            else 
            {
                const response = await fetch(resourcePath);
                if(response.ok == false)
                {
                    throw new Error(`Error loading audio file: ${resourcePath}`);
                } 
                this.dataBuffer = await response.arrayBuffer();
                await saveToCache(resourcePath, this.dataBuffer);
            }             
            this.audioBuffer = await context.audioContext.decodeAudioData(structuredClone(this.dataBuffer));
        }
    }
    
    /**
     * A register is a frequency paired with an
     * octave to reference a distinct point on the
     * audio spectrum.
     * 
     * Each key on a keyboard or each pad on a midi
     * pad can be thought of as a register of a
     * fundamental note frequency. Registers what 
     * is used to define which notes specific
     * inputs should play.
     * 
     * Registers correspond to the 12 notes of the
     * western scale. This library represents the full
     * spectrum that midi covers with 10 registrations
     * for each natural and accidental (sharp or flat) note.
     */
    export class Register
    {
        frequency: number = -1;
        octave: number = -1;
        defaultLabel: string = "";

        constructor(defaultLabel?: string, frequency?: number, octave?: number)
        {
            this.defaultLabel = defaultLabel ?? this.defaultLabel;
            this.frequency = frequency ?? this.frequency;
            this.octave = octave ?? this.octave;
        }
    }
    export class KeybedRegister extends Register
    {
        offset: number = -1;
    }
    
    export interface Instrument
    {
        /**
         * A label-formatted name for displaying in the UI.
         */
        name: string;
        // playbackMethod: PlaybackMethod;
        modes: string[];
        selectedMode?: string;
        load?: (context: ControllerContext, onProgressEvent?: (event: { instrument: MagnitSynth.Instrument, progress: number }) => void) => Promise<void>;
        playNote: (context: ControllerContext, note: any) => Promise<NoteProperties>;
        endNote: (context: ControllerContext, note: any) => Promise<void>;
        disconnectNote: (context: ControllerContext, note: any) => void;
    }
    
    export interface Oscillator
    {
        selectedMode: OscillatorType;
    }

    export abstract class SimpleSampleInstrument implements Instrument
    {
        name!: string;
        selectedMode?: string;
        modes: string[] = [];
        samples: Sample[] = [];
        isLoaded: boolean = false;

        constructor(samples?: Sample[])
        {
            this.samples = samples ?? this.samples;
        }

        static fromSampleIndexMap(sampleData: Map<string, number>)
        {

        }
        
        static fromSamples(sampleData: Sample[])
        {

        }

        static intoSamples(context: ControllerContext, paths: (string|string[])[], offsetFromA0: number = 0, sectionKey: string = "main")
        {
            const samples: Sample[] = [];
            const registers = getIndexedRegisters();

            for(let i = offsetFromA0; i < (offsetFromA0 + paths.length); i++)
            {
                const entry = paths[i-offsetFromA0]!;
                const register = registers[i]!;
                const inputRegister = context.findInputRegister(sectionKey, register.frequency);
                if(inputRegister == null) { console.error('InputMessage not found'); continue; }
                if(Array.isArray(entry))
                {
                    for(let j = 0; j < entry.length; j++)
                    {
                        const entryValue = entry[j]!;
                        const name = (entryValue.indexOf('/') == -1) ? entryValue : entryValue.substring(entryValue.lastIndexOf('/') + 1);
                        samples.push(new Sample(entryValue, inputRegister.defaultLabel, register.frequency, name));
                    }
                    continue;
                }

                const name = (entry.indexOf('/') == -1) ? entry : entry.substring(entry.lastIndexOf('/') + 1);
                samples.push(new Sample(entry, inputRegister.defaultLabel, register.frequency, name))
            }

            return samples;
        }
        static intoSamples_Frequency(context: ControllerContext, sampleData: Map<number, string[]>, sectionKey: string = "main")
        {
            const samples: Sample[] = [];

            for(const [frequency, paths] of sampleData)
            {
                const inputRegister = context.findInputRegister(sectionKey, frequency);
                if(inputRegister == null) { console.error('Input Register not found'); continue; }

                for(let i = 0; i < paths.length; i++)
                {
                    const pathValue = paths[i]!;
                    const name = (pathValue.indexOf('/') == -1) ? pathValue : pathValue.substring(pathValue.lastIndexOf('/') + 1);
                    samples.push(new Sample(pathValue, inputRegister.defaultLabel, frequency, name));
                }
            }

            return samples;
        }
        
        async load(context: ControllerContext, onProgressEvent?: (event: { instrument: MagnitSynth.Instrument, progress: number }) => void)
        {
            try
            {
                const promises: Promise<void>[] = [];
                for(let i = 0; i < this.samples.length; i++)
                {
                    promises.push(new Promise(async (resolve) =>
                    {
                        await this.samples[i]!.load(context)
                        if(onProgressEvent != null)
                        {
                            const progress =  parseFloat(((i / this.samples.length) * 100).toFixed(2));
                            onProgressEvent({instrument: this, progress: progress})
                        }
                        resolve();
                    }));
                }
                await Promise.all(promises);
                if(onProgressEvent != null)
                {
                    onProgressEvent({instrument: this, progress: 100});
                }
            }
            catch(error)
            {
                console.error(error);
            }
        }

        async playNote(context: ControllerContext, note: Note)
        {
            // find closest sample
            const sample = this.findClosestSample(note);

            const properties: SampleNoteProperties = 
            {
                sample,
                gainNode: context.audioContext.createGain(),
                volume: .5,
                audioSourceNode: context.audioContext.createBufferSource()
            };

            properties.audioSourceNode.buffer = sample.audioBuffer!;
            properties.audioSourceNode.connect(properties.gainNode);

            properties.gainNode.connect(context.mainVolumeGainNode);
            properties.gainNode.gain.setValueAtTime(0, context.audioContext.currentTime);
            properties.gainNode.gain.linearRampToValueAtTime(.5, context.audioContext.currentTime + .02);

            properties.audioSourceNode.start();

            return properties;
        }

        findClosestSample(note: Note): Sample
        {
            if(this.samples.length == 0) { throw new Error('Cannot find samples when samples property is empty.'); }

            let highestVelocity_closestFrequency_Sample = this.samples[0]!;
            for(let i = 1; i < this.samples.length; i++)
            {
                const sample = this.samples[i]!;
                if(note.frequency + FrequencyTolerance <= sample.noteFrequency)
                {
                    break;
                }
                highestVelocity_closestFrequency_Sample = sample;
            }

            const velocitySamples = this.samples.filter(sample => sample.noteFrequency == highestVelocity_closestFrequency_Sample.noteFrequency);

            let lowestDifference = 0;
            let closestSample = velocitySamples[0]!;
            for(let i = 0; i < velocitySamples.length; i++)
            {
                if(note.velocity == velocitySamples[i]!.noteVelocity)
                {
                    closestSample = velocitySamples[i]!;
                    break;
                }
                else
                {
                    const difference = Math.abs(note.velocity - velocitySamples[i]!.noteVelocity);
                    if(lowestDifference == 0 || difference < lowestDifference)
                    {
                        lowestDifference = difference;
                        closestSample = velocitySamples[i]!;
                    }
                }
            }
            return closestSample;
        }

        async endNote(context: ControllerContext, note: Note): Promise<void>
        {
            return new Promise<void>((resolve) => 
            {
                const noteProperties = context.findActiveNoteProperties(this, note);
                if(noteProperties == null) { throw new Error("Could not find note"); }

                // volume (gain) ramping prevents 'pop' sounds;
                noteProperties.gainNode.gain.cancelScheduledValues(context.audioContext.currentTime);
                noteProperties.gainNode.gain.setValueAtTime(noteProperties.gainNode.gain.value, context.audioContext.currentTime);
                noteProperties.gainNode.gain.linearRampToValueAtTime(0, context.audioContext.currentTime + .2);

                if(note.playbackTimeout != null)
                {
                    clearTimeout(note.playbackTimeout);
                }

                note.playbackTimeout = setTimeout(() =>
                {
                    resolve();
                }, 202);
            });
        }
        disconnectNote(context: ControllerContext, note: Note)
        {
            const noteProperties = context.findActiveNoteProperties(this, note) as SampleNoteProperties;
            if(noteProperties == null) { throw new Error("Could not find note"); }

            noteProperties.audioSourceNode.disconnect();
            noteProperties.gainNode.disconnect();
        }
    }
    export abstract class InterpolatedSampleInstrument extends SimpleSampleInstrument
    {
        async playNote(context: ControllerContext, note: Note)
        {
            // find closest sample
            const sample = this.findClosestSample(note);

            const properties: SampleNoteProperties = 
            {
                sample,
                gainNode: context.audioContext.createGain(),
                volume: .5,
                audioSourceNode: context.audioContext.createBufferSource()
            };

            properties.audioSourceNode.buffer = sample.audioBuffer!;
            properties.audioSourceNode.connect(properties.gainNode);

            properties.gainNode.connect(context.mainVolumeGainNode);
            properties.gainNode.gain.setValueAtTime(0, context.audioContext.currentTime);
            properties.gainNode.gain.linearRampToValueAtTime(.5, context.audioContext.currentTime + .02);

            // Interpolation (smoothly move between one thing and another thing by using math)
            
            // we need to get from the samples we have to the note
            // requested, based on the distance between their frequencies.

            // midi values are an easy way to break the frequency
            // spectrum up into "intervals": notes, in scale order (C,C#,D,D#,E,F,F#,G,G#,A,A#,B)

            // get note midi value
            const noteMidiValue = MagnitSynth.convertFrequencyToMidiValue(note.frequency);
            const cents = noteMidiValue - Math.round(noteMidiValue); // calculate remainder

            // get sample midi value
            const sampleMidiValue = MagnitSynth.convertFrequencyToMidiValue(sample.noteFrequency);

            // get the number of intervals between
            // the midi value of the note and the sample
            const midiDistance = noteMidiValue - sampleMidiValue;
            const intervalDistance = midiDistance + cents;

            // convert the number of intervals into a ratio
            // of the frequency distance / 12 notes in the scale
            const playbackRate = convertIntervalToFrequencyRatio(intervalDistance);

            // set the playback speed of the sample's audio
            properties.audioSourceNode.playbackRate.value = playbackRate;

            // ^^^
            // updating sample speed will adjust the pitch; we determine how
            // much we need to adjust, then set the speed without shifting
            // the pitch to accomodate for the speed shift.
            
            // The result is the sample playing back as the 'correct' note
            // frequency. This just uses the same effect as changing your
            // voice by speeding up or slowing down a recording of it.

            properties.audioSourceNode.start();

            return properties;
        }
    }
    
    // export class WaveTablePlayer implements Instrument
    // {
    //     // playbackMethod: PlaybackMethod = 'wave-table';
    //     modes: string[] = [];

    //     constructor(public name: string, private waveTableData: WaveTableData)
    //     {

    //     }
    //     async playNote(context: ControllerContext, note: any)
    //     {
    //         const node = context.audioContext.createOscillator();
    //         const wave = context.audioContext.createPeriodicWave(Float32Array.from(this.waveTableData.real), Float32Array.from(this.waveTableData.imaginary));
    //         node.setPeriodicWave(wave);
    //         node.frequency.value = note.frequency;
    //         node.connect(context.defaultGainNode);
    //         // return node;
    //         return {gainNode: new GainNode(context.audioContext), volume: .5};
    //     }
    //     async endNote(context: ControllerContext, note: Note): Promise<void>
    //     {
    //         return new Promise<void>((resolve) => 
    //         {
    //             const noteProperties = context.findActiveNoteProperties(this, note);
    //             if(noteProperties == null) { throw new Error("Could not find note"); }

    //             // volume (gain) ramping prevents 'pop' sounds;
    //             noteProperties.gainNode.gain.cancelScheduledValues(context.audioContext.currentTime);
    //             noteProperties.gainNode.gain.setValueAtTime(noteProperties.gainNode.gain.value, context.audioContext.currentTime);
    //             noteProperties.gainNode.gain.linearRampToValueAtTime(0, context.audioContext.currentTime + .2);

    //             if(note.playbackTimeout != null)
    //             {
    //                 clearTimeout(note.playbackTimeout);
    //             }

    //             note.playbackTimeout = setTimeout(() =>
    //             {
    //                 resolve();
    //             }, 202);
    //         });
    //     }
    //     disconnectNote(context: ControllerContext, note: Note)
    //     {
    //         const noteProperties = context.findActiveNoteProperties(this, note) as SampleNoteProperties;
    //         if(noteProperties == null) { throw new Error("Could not find note"); }

    //         noteProperties.audioSourceNode.disconnect();
    //         noteProperties.gainNode.disconnect();
    //     }
    // }
    
    export type NoteProperties = 
    {
        gainNode: GainNode;
        volume: number;
        isProcessing?: boolean;
        [key: string]: any;
    }
    export type OscillatorNoteProperties = NoteProperties & { oscillatorNode: OscillatorNode };
    export type SampleNoteProperties = NoteProperties & { audioSourceNode: AudioBufferSourceNode; sample: Sample; };

    
    export class WaveTableData
    {
       constructor(public real: number[], public imaginary: number[])
       {

       }
    }

    
    let KeybedRegisters: KeybedRegister[]|null = null;
    let IndexedRegisters: KeybedRegister[]|null = null;
    export function frequencyRangeToKeybedRegisters(start: number, end: number)
    {

        // intervals are the notes in the western scale;
        // you can think of each interval as a key on the keyboard.
        
        // the start and end are counts of intervals
        // away from 440, positive or negative

        // -48 starts the frequencies at A0: 27.5hz;
        // -9 starts at C4: 261hz
        // 0 starts at A4: 440hz
        
        // keybed intervals include an offset for rendering the
        // keybed keys using a css-grid-based structure

        let black = 0;
        let white = -2;

        let frequencies = new Array<KeybedRegister>(end - start);
        for(let i = 0; i < frequencies.length; i++)
        {
            const key = (start + i) % NotesInOctave;
            const note = NoteNames_ScientificNotation[key < 0 ? NotesInOctave + key : key]!;
            const octave = Math.ceil(4 + (start + i) / NotesInOctave);
            if(i == 0 && note == "C") { black = -3; }
            if(note.indexOf('#') > -1)
            {
                black +=3;
                if(note == "C#" || note == "F#")
                {
                    black += 3;
                }
            }
            else
            {
                white += 3;
            }
            frequencies[i] = 
            {
                defaultLabel: note,
                frequency: getHertz(start + i),
                octave: (note == "B" || note == "A#") ? octave - 1 : octave,
                offset: (note.indexOf('#') > -1) ? black : white
            };
        }
        KeybedRegisters = frequencies;
        return KeybedRegisters;
    }

    export function frequencyRangeToRegisters(start: number, end: number)
    {
        // intervals are the notes in the western scale.
        // you can think of each interval as a key 
        // on a piano keyboard.
        
        // the start and end are counts of intervals
        // away from 440, positive or negative

        // -48 starts the frequencies at A0: 27.5hz;
        // -9 starts at C4: 261hz
        // 0 starts at A4: 440hz

        let frequencies = new Array<Register>(end - start);
        for(let i = 0; i < frequencies.length; i++)
        {
            const interval = (start + i) % NotesInOctave;
            const note = NoteNames_ScientificNotation[interval < 0 ? NotesInOctave + interval : interval]!;
            const octave = Math.ceil(4 + (start + i) / NotesInOctave);
            frequencies[i] = 
            {
                defaultLabel: note,
                frequency: getHertz(start + i),
                octave: (note == "B" || note == "A#") ? octave - 1 : octave
            };
        }
        return frequencies;
    }

    export function registerCountToRegisters(count: number, start: number = MinimumSupportedRegisterDistance)
    {
        if(start < MinimumSupportedRegisterDistance || start > MaximumSupportedRegisterDistance)
        {
            throw new Error('Cannot create registers outside of frequency bounds.');
        }

        const end = start + count;

        if(end < MinimumSupportedRegisterDistance || end > MaximumSupportedRegisterDistance)
        {
            throw new Error('Cannot create registers outside of frequency bounds.');
        }
        return frequencyRangeToRegisters(start, end);
    }
    export function registerCountToKeybedRegisters(count: number, start: number = MinimumSupportedRegisterDistance)
    {
        if(start < MinimumSupportedRegisterDistance || start > MaximumSupportedRegisterDistance)
        {
            throw new Error('Cannot create registers outside of frequency bounds.');
        }

        const end = start + count;

        if(end < MinimumSupportedRegisterDistance || end > MaximumSupportedRegisterDistance)
        {
            throw new Error('Cannot create registers outside of frequency bounds.');
        }
        return frequencyRangeToKeybedRegisters(start, end);
    }
    export function getKeybedRegisters(count: number = 88)
    {
        if(KeybedRegisters != null && KeybedRegisters.length == count)
        {
            return KeybedRegisters;
        }

        const start = Keyboard_LengthToStartOffsetMap.get(count);
        if(start == null) { throw new Error('Unknown keyboard key count requested.'); }
        const end = start + count;
        return frequencyRangeToKeybedRegisters(start, end);
    }
    export function getIndexedRegisters()
    {
        if(IndexedRegisters != null)
        {
            return IndexedRegisters;
        }
        const start = MinimumSupportedRegisterDistance;
        const end = MaximumSupportedRegisterDistance;
        return frequencyRangeToRegisters(start, end);
    }


    export function getHertz(n: number = 0)
    {
        return A4Frequency * Math.pow(2, n / NotesInOctave);
    }

    

    export function convertFrequencyToMidiValue(frequency: number): number 
    {
        return 69 + 12 * Math.log2(frequency / A4Frequency);
    }
    export function convertMidiValueToFrequency(note: number): number 
    {
        return A4Frequency * Math.pow(2, (note - 69) / 12);
    }
    export function convertIntervalToFrequencyRatio(interval: number): number
    {
        return Math.pow(2, (interval / 12));
    }

    

    // Indexed DB interface
    
    const CacheDatabaseName = 'MusicalKeyboardCache';
    const CacheDatabaseVersion = 1;
    const CacheDatabaseSchema = { items: 'path' };
    let CacheDatabase: IDBDatabase;

    function openDatabase()
    {
        return new Promise<void>((resolve, reject) =>
        {                
            const request = indexedDB.open(CacheDatabaseName, CacheDatabaseVersion);
            request.onsuccess = (event) =>
            {
                const dbEvent = event.target as any;
                CacheDatabase = dbEvent.result;
                resolve();
            };

            request.onupgradeneeded = async (event: IDBVersionChangeEvent) =>
            {
                const dbEvent = event.target as any;
                CacheDatabase = dbEvent.result;
                await createDatabase(CacheDatabaseSchema);
                resolve();
            };

            request.onerror = (event) => { reject(event); }

        });
    }
    function createDatabase(schema: {[key: string]: string})
    {
        const storePromises: Promise<void>[] = [];
        for(const [tableName, columnName] of Object.entries(schema))
        {
            storePromises.push(new Promise((resolve, reject) =>
            {
                const objectStore = CacheDatabase.createObjectStore(tableName, {keyPath: columnName });
                objectStore.transaction.oncomplete = (event) =>
                {
                    resolve();
                }
                objectStore.transaction.onerror = (event) =>
                {
                    reject(event);
                }
            }))
        }

        return Promise.all(storePromises);
    }
    async function openDatabaseTransaction()
    {
        if(CacheDatabase == null) { await openDatabase(); }
        return new Promise<IDBTransaction>(async (resolve, reject) =>
        {
            if(CacheDatabase == null) { reject("The database has not been opened."); return; }

            const transaction = CacheDatabase.transaction('items', 'readwrite');
            transaction.onerror = (event) => { reject(event); }
            // transaction.oncomplete = (event) => {  }
            resolve(transaction);
        });
    }

    function loadFromCache(key: string)
    {
        return new Promise(async (resolve, reject) =>
        {
            const transaction = await openDatabaseTransaction();
            const objectStore = transaction.objectStore('items');
            const request = objectStore.get(key);
            request.onsuccess = (event) =>
            {
                const value = (event.target as any).result;
                resolve(value);
            }
            request.onerror = (event) => { reject(event); }
        });
    }
    function saveToCache(key: string, data: ArrayBuffer)
    {
        return new Promise(async (resolve, reject) =>
        {
            const transaction = await openDatabaseTransaction();
            const objectStore = transaction.objectStore('items');
            const request = objectStore.put({path: key, value: data});
            request.onsuccess = (event) =>
            {
                const value = (event.target as any).result;
                resolve(value);
            }
            request.onerror = (event) => { reject(event); }
        });
    }

    // end Indexed DB interface
}