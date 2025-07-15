import { DealStatus } from '../entities/deal.entity';

export interface ICreateDealInput {
    name: string;
    discountPercentage: number;
    status: DealStatus;
}

export interface IUpdateDealInput {
    name?: string;
    discountPercentage?: number;
    status?: DealStatus;
}

export interface IDealsQueryParams {
    status?: DealStatus;
}

export interface IDealResponse {
    id: number;
    name: string;
    discountPercentage: number;
    status: DealStatus;
    createdById: number;
    createdAt: string;
    updatedAt: string;
}

export interface IDealsResponse {
    deals: IDealResponse[];
    total: number;
    productCounts: { [dealId: string]: number };
}