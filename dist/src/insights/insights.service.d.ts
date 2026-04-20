import { PrismaService } from '../prisma/prisma.service';
export declare class InsightsService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    cashForecast(lookbackDays?: number, horizonDays?: number): Promise<{
        windowDays: number;
        horizonDays: number;
        historical: {
            date: string;
            revenue: number;
            expense: number;
            netCash: number;
        }[];
        forecast: {
            date: string;
            revenue: number;
            expense: number;
            netCash: number;
        }[];
        summary: {
            avgDailyRevenue: number;
            avgDailyExpense: number;
            avgDailyNet: number;
            forecastTotalRevenue: number;
            forecastTotalExpense: number;
            forecastTotalNet: number;
        };
    }>;
    private projectDaily;
    detectAnomalies(windowDays?: number, zThreshold?: number): Promise<{
        windowDays: number;
        zThreshold: number;
        revenue: {
            series: {
                date: string;
                value: number;
                orders: number;
            }[];
            anomalies: {
                date: string;
                value: number;
                expected: number;
                zScore: number;
                direction: "HIGH" | "LOW";
            }[];
        };
        expense: {
            series: {
                date: string;
                value: number;
            }[];
            anomalies: {
                date: string;
                value: number;
                expected: number;
                zScore: number;
                direction: "HIGH" | "LOW";
            }[];
        };
    }>;
    driverScorecard(periodDays?: number): Promise<{
        periodDays: number;
        drivers: {
            score: number;
            driverId: string;
            fullName: string;
            branchName: string | null;
            trips: number;
            revenueKd: number;
            revenuePerTripKd: number;
            avgTurnaroundHours: number;
        }[];
    }>;
}
