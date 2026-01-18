import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db';

export class Settings extends Model {
    public id!: number;
    public theme!: string;
    public language!: string;
    // Add other settings fields here
}

Settings.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        theme: {
            type: DataTypes.STRING,
            defaultValue: 'light',
        },
        language: {
            type: DataTypes.STRING,
            defaultValue: 'en',
        },
    },
    {
        sequelize,
        tableName: 'Settings',
    }
);
