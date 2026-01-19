import { Router } from 'express';
import { aiService } from '../services/aiService';
import { Analysis } from '../models/Analysis';
import { Encounter } from '../models/Encounter';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Trigger Analysis (Async / Non-blocking)
router.post('/:encounterId', async (req, res) => {
    try {
        const { encounterId } = req.params;
        const encounter = await Encounter.findByPk(encounterId);

        if (!encounter) {
            return res.status(404).json({ error: 'Encounter not found' });
        }

        // Check if analysis already exists
        let analysis = await Analysis.findOne({ where: { encounterId } });

        if (analysis && (analysis.status === 'processing' || analysis.status === 'completed')) {
            return res.json(analysis);
        }

        if (!analysis) {
            analysis = await Analysis.create({
                id: uuidv4(),
                encounterId: encounterId,
                status: 'processing'
            });
        } else {
            analysis.status = 'processing';
            await analysis.save();
        }

        encounter.status = 'analyzing';
        await encounter.save();

        // Trigger background processing
        (async () => {
            try {
                console.log(`[Background] Starting analysis for encounter: ${encounterId}`);

                let transcript = encounter.transcript || "";
                if (encounter.audioPath && !transcript) {
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

                analysis!.differential = result.differential;
                analysis!.plan = result.plan;
                analysis!.visualFindings = result.visualFindings;
                analysis!.status = 'completed';
                await analysis!.save();

                encounter.status = 'review';
                await encounter.save();

                console.log(`[Background] Analysis completed for encounter: ${encounterId}`);
            } catch (bgError) {
                console.error(`[Background] Analysis failed for encounter: ${encounterId}`, bgError);
                analysis!.status = 'failed';
                await analysis!.save();

                encounter.status = 'pending'; // Fallback to pending so user can retry
                await encounter.save();
            }
        })();

        // Return the pending/processing analysis object immediately
        res.json(analysis);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to initiate analysis' });
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
