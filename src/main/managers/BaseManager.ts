import { IBaseSettings } from "@/interfaces/MainSettingsInterface";

interface WithId {
    id?: string;
}

export abstract class BaseManager<T extends IBaseSettings & WithId> {
    protected data: T[];
    protected static instance: any = null;

    protected constructor(initialData: T | T[]) {
        // Se o dado for único, transforme-o em um array
        this.data = Array.isArray(initialData) ? initialData : [initialData];
    }

    /**
     * @description Gets the singleton instance of the class.
     * @returns The singleton instance of the class.
     */
    public getData(): T | null {
        if (this.data.length > 0)
            return this.data[0];
        return null;
    }

    /**
     * @description This method returns the array of data stored in the manager.
     * @returns The array of data.
     */
    public getDataArray(): T[] {
        return this.data;
    }

    /**
     * @description This method adds a new item to the array of data.
     * @param newItem The new item to add to the array.
     */
    public addItem(newItem: T): void {
        this.data.push(newItem);
    }

    /**
     * Updates the data in the array.
     * @param updatedData The new data to set if indexOrData is a number.
     * @returns The updated item or a null indicating success or failure.
     */
    public update(updatedData?: Partial<T>): T | null {
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
                this.data[0] = { ...this.data[0], ...updatedData };
                return this.data[0]; 
            }
        }

        return null;
    }
    
    /**
     * Updates an item in the array at the specified index.
     * @param index The zero-based index of the item to update.
     * @param updatedItem The new item to replace the old one.
     * @returns confirmation of the update
     */
    public updateItem(index: number, updatedItem: T): boolean {
        if (index >= 0 && index < this.data.length) {
            this.data[index] = updatedItem;
            return true;
        }
        return false;
    }

    /**
     * Removes an item from the array at the specified index or by its ID.
     * @param indexOrId The zero-based index of the item to remove or the ID of the item.
     * @returns confirmation of the removal
     */
    public removeItemByIndex(indexOrId: number | string): boolean {
        if (typeof indexOrId === 'number') { 
            if (indexOrId >= 0 && indexOrId < this.data.length) {
                this.data.splice(indexOrId, 1);
                return true;
            }
        }

        if (typeof indexOrId === 'string') {
            const indexToDelete = this.data.findIndex((item) => item.id === indexOrId);
            console.log('..: index:', indexToDelete, 'id:', indexOrId, 'data:', this.data);
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
    public removeAllData(): void {
        this.data.splice(0, this.data.length);
    }
   
}