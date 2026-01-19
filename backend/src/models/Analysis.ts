import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db';
import { Encounter } from './Encounter';

export class Analysis extends Model {
    public id!: string;
    public encounterId!: string;
    public differential!: any; // JSON structure for differential
    public plan!: any; // JSON structure for plan
    public visualFindings?: string[]; // JSON structure for interpreted image findings
    public status!: 'pending' | 'processing' | 'completed' | 'failed';
    public finalNote?: string;
    public createdAt!: Date;
    public updatedAt!: Date;
}

Analysis.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        encounterId: {
            type: DataTypes.UUID,
            allowNull: false,
            // References will be set up in associations
        },
        differential: {
            type: DataTypes.JSONB, // Postgres JSONB for structured data
            allowNull: true,
        },
        plan: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
        visualFindings: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
            defaultValue: 'pending',
            allowNull: false,
        },
        finalNote: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: 'Analyses',
    }
);

// Define Association (can be done here or in a central models/index.ts)
// For simplicity in this file-based approach, I'll export a setup function or handle it in index.ts
