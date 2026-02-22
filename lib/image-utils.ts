/**
 * Compresses an image file by resizing it and reducing quality.
 * Returns a new File object.
 */
export async function compressImage(
    file: File,
    options: {
        maxWidth?: number;
        maxHeight?: number;
        quality?: number;
        type?: string;
    } = {}
): Promise<File> {
    const {
        maxWidth = 800,
        maxHeight = 800,
        quality = 0.7,
        type = 'image/jpeg'
    } = options;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate new dimensions while maintaining aspect ratio
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Canvas to Blob conversion failed'));
                            return;
                        }
                        const compressedFile = new File([blob], file.name, {
                            type,
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    },
                    type,
                    quality
                );
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}
