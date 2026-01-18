import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db';

export class Encounter extends Model {
    public id!: string;
    public title!: string; // e.g., "Patient Visit - Date"
    public audioPath?: string;
    public clinicalFilePaths?: string[]; // Array of paths for images/PDFs
    public textNotes?: string;
    public transcript?: string;
    public patientId?: string; // Optional for MVP
    public status!: 'pending' | 'analyzing' | 'review' | 'completed';
    public createdAt!: Date;
    public updatedAt!: Date;
}

Encounter.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'New Encounter',
        },
        audioPath: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        clinicalFilePaths: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: [],
        },
        textNotes: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        transcript: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM('pending', 'analyzing', 'review', 'completed'),
            defaultValue: 'pending',
        },
    },
    {
        sequelize,
        tableName: 'Encounters',
    }
);
