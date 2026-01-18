import { Router } from 'express';
import { aiService } from '../services/aiService';
import { Analysis } from '../models/Analysis';
import { Encounter } from '../models/Encounter';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Trigger Analysis
router.post('/:encounterId', async (req, res) => {
    try {
        const { encounterId } = req.params;
        const encounter = await Encounter.findByPk(encounterId);

        if (!encounter) {
            return res.status(404).json({ error: 'Encounter not found' });
        }

        encounter.status = 'analyzing';
        await encounter.save();

        // Simulate async processing (or await if fast)
        // For MVP, we await.

        let transcript = "";
        if (encounter.audioPath) {
            transcript = await aiService.transcribe(encounter.audioPath);
            encounter.transcript = transcript;
            await encounter.save();
        }

        const result = await aiService.analyzeEncounter(
            encounterId,
            transcript,
            encounter.textNotes,
            encounter.clinicalFilePaths || []
        );

        const analysis = await Analysis.create({
            id: uuidv4(),
            encounterId: encounterId,
            differential: result.differential,
            plan: result.plan,
            visualFindings: result.visualFindings,
            status: 'completed'
        });

        encounter.status = 'review';
        await encounter.save();

        res.json(analysis);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

// Get Analysis
router.get('/:encounterId', async (req, res) => {
    try {
        const { encounterId } = req.params;
        const analysis = await Analysis.findOne({ where: { encounterId } });
        if (!analysis) return res.status(404).json({ error: 'Analysis not found' });
        res.json(analysis);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch analysis' });
    }
});

// AI Note Generation
router.post('/generate-note/:encounterId', async (req, res) => {
    try {
        const { encounterId } = req.params;
        const { type } = req.body;

        const encounter = await Encounter.findByPk(encounterId);
        if (!encounter) return res.status(404).json({ error: 'Encounter not found' });

        const analysis = await Analysis.findOne({ where: { encounterId } });
        if (!analysis) return res.status(404).json({ error: 'Analysis must be run before generating note.' });

        const note = await aiService.generateClinicalNote(
            encounter.transcript || "",
            encounter.textNotes || "",
            analysis,
            type
        );

        res.json({ note });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to generate AI note' });
    }
});

export default router;
