import { IBaseSettings } from "@/interfaces/MainSettingsInterface";

interface WithId {
    id?: string;
}

export abstract class ABaseSettingsManager<T extends IBaseSettings & WithId> {
    protected data: T[] = [];
    protected static instance: any = null;

    protected constructor() {
        this.data = [];
    }

    /**
     * @description This method adds a new item to the array of data.
     * @param newItem The new item to add to the array.
     */
    protected addItem(newItem: T): void {
        this.data.push(newItem);
    }

    /**
     * 
     * @param type The type of data to retrieve.
     * @returns The first item of the specified type or null if not found.
     */
    protected getDataByType(type: string): T | null {
        const indexOfItem = this.data.findIndex((item) => item._resourceType === type);
        return indexOfItem !== -1 ? this.data[indexOfItem] : null;
    }

    /**
     * Returns all data of a specific type.
     * @param type The type of data to retrieve.
     * @returns An array of items of the specified type.
     */
    protected getAllDataByType(type: string): T[] {
        return this.data.filter((item) => item._resourceType === type);
    }

    /**
    * @description This method returns the array of data stored in the manager.
    * @returns The array of data.
    */
    protected getDataArray(): T[] {
        return this.data;
    }

    /**
    * Updates the data in the array.
    * @param updatedData The new data to set if indexOrData is a number.
    * @returns The updated item or a null indicating success or failure.
    */
    protected update(updatedData?: Partial<T>): T | null {
        // Atualizar os dados gerais
        if (this.data.length > 0 && updatedData) {
            // Verificar ID para update
            const indexOfItem = updatedData?.id;

            if (indexOfItem) {
                // Verificar ID para update
                const indexOfItem = this.data.findIndex((item) => item.id === updatedData.id);
                // Atualizar o item encontrado e retornar o objeto atualizado
                this.data[indexOfItem] = { ...this.data[indexOfItem], ...updatedData };
                return this.data[indexOfItem];
            } else {
                const indexOfItem = this.data.findIndex((item) => item._resourceType === updatedData._resourceType);

                this.data[indexOfItem] = { ...this.data[indexOfItem], ...updatedData };
                return this.data[indexOfItem];
            }
        }

        return null;
    }

    /**
     * Removes an item from the array at the specified index or by its ID.
     * @param idOrResourceType The zero-based index of the item to remove or the ID of the item.
     * @returns confirmation of the removal
     */
    protected removeItemByIdOrResourceType(idOrResourceType: string): boolean {
        let indexToDelete = null;

        const indexOfItem = this.data.findIndex((item) => item.id === idOrResourceType);
        if (indexOfItem) {
            indexToDelete = indexOfItem;
        } else {
            const indexOfResourceType = this.data.findIndex((item) => item._resourceType === idOrResourceType);
            if (indexOfResourceType) {
                indexToDelete = indexOfResourceType;
            }
        }

        if (indexToDelete) {
            console.log('..: index:', indexToDelete, 'id or resourceType:', idOrResourceType, 'data:', this.data);
            if (indexToDelete !== -1) {
                this.data.splice(indexToDelete, 1);
                return true;
            }
            return false;
        }

        return false;
    }

    /**
     * Removes all items from the array.
     */
    protected removeAllData(): void {
        this.data.splice(0, this.data.length);
    }

}