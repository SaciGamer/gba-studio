interface IElement {
    id: string;
}

export interface ElementContextType<T extends IElement> {
    // Selected Element
    elementSelected: T | null;
    setElementSelected: React.Dispatch<React.SetStateAction<T | null>>;
}