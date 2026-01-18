import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { sequelize } from './db';
import './models/Settings';
import './models/Encounter';
import './models/Analysis';
import encounterRoutes from './routes/encounters';
import analysisRoutes from './routes/analysis';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/encounters', encounterRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/uploads', express.static('uploads'));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

const startServer = async () => {
    try {
        // Retry connection logic could be added here for docker startup timing
        await sequelize.authenticate();
        console.log('Database connected.');

        // Sync models (Auto-create tables)
        await sequelize.sync({ alter: true });

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
};

startServer();
