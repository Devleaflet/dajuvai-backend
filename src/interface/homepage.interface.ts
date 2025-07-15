export interface ICreateHomepageSectionInput {
    title: string;
    isActive: boolean;
    productIds: number[];
}

export interface IUpdateHomePageSectionInput {
    sectionId: number,
    isActive?: boolean,
    title?: string,
    productIds?: number[];
}