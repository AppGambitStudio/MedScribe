import { Router } from 'express';
import multer from 'multer';
import { Encounter } from '../models/Encounter';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = require('path').extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// Create Encounter
router.post('/', upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'clinical_files' } // Using a consistent name for all clinical files
]), async (req, res) => {
    try {
        const { title, textNotes, existingFilePaths, existingAudioPath } = req.body;
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        const audioFile = files['audio']?.[0];
        const newClinicalFiles = files['clinical_files'] || [];

        // Parse existing paths if provided
        let mergedPaths: string[] = [];
        if (existingFilePaths) {
            try {
                mergedPaths = JSON.parse(existingFilePaths);
            } catch (e) {
                console.error("Failed to parse existingFilePaths:", e);
            }
        }

        // Add brand new uploads
        const newPaths = newClinicalFiles.map(f => f.path);
        mergedPaths = [...mergedPaths, ...newPaths];

        const encounter = await Encounter.create({
            id: uuidv4(),
            title: title || 'Untitled Encounter',
            textNotes: textNotes,
            audioPath: audioFile ? audioFile.path : (existingAudioPath || null),
            clinicalFilePaths: mergedPaths,
            status: 'pending'
        });

        res.json(encounter);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create encounter' });
    }
});

// List Encounters
router.get('/', async (req, res) => {
    try {
        const encounters = await Encounter.findAll({ order: [['createdAt', 'DESC']] });
        res.json(encounters);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch encounters' });
    }
});

// Get Encounter Detail
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const encounter = await Encounter.findByPk(id);
        if (!encounter) return res.status(404).json({ error: 'Encounter not found' });
        res.json(encounter);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch encounter' });
    }
});

// Manual Transcription endpoint
router.post('/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }
        const { aiService } = require('../services/aiService'); // Lazy load to avoid circular deps if any
        const transcript = await aiService.transcribe(req.file.path);
        res.json({ transcript });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Transcription failed' });
    }
});

export default router;
