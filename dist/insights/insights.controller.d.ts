import { StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { InsightsQueryDto } from './dto/insights-query.dto';
import { InsightsService } from './insights.service';
import { WeeklyExecutiveReportService } from './weekly-executive-report.service';
export declare class InsightsController {
    private readonly insights;
    private readonly weekly;
    constructor(insights: InsightsService, weekly: WeeklyExecutiveReportService);
    cashForecast(q: InsightsQueryDto): Promise<{
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
    anomalies(q: InsightsQueryDto): Promise<{
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
    driverScorecard(q: InsightsQueryDto): Promise<{
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
    listWeekly(): Promise<{
        key: string;
        filename: string;
        sizeBytes: number;
        generatedAt: string;
    }[]>;
    regenerateWeekly(): Promise<{
        key: string;
        filename: string;
        sizeBytes: number;
        generatedAt: string;
        periodFrom: string;
        periodTo: string;
    }>;
    downloadWeekly(key: string, res: Response): Promise<StreamableFile>;
}
