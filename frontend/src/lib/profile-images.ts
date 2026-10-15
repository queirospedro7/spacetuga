export async function readProfileImage(file: File, maxDimension: number): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Escolhe um ficheiro de imagem válido.');
    if (file.size > 15 * 1024 * 1024) throw new Error('A imagem não pode exceder 15 MB.');
    if (file.type === 'image/gif') {
      if (file.size > 350_000) throw new Error('GIFs animados têm de ter menos de 350 KB.');
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Erro no GIF')));
        reader.onerror = () => reject(new Error('Erro no GIF'));
        reader.readAsDataURL(file);
      });
    }

    const source = URL.createObjectURL(file);
    try {
      const image = document.createElement('img');
      image.src = source;
      try { await image.decode(); } catch { throw new Error('Não foi possível ler esta imagem. Usa outro ficheiro.'); }
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Não foi possível processar a imagem.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      let quality = 0.88;
      let result = canvas.toDataURL('image/webp', quality);
      while (result.length > 350_000 && quality > 0.45) {
        quality -= 0.08;
        result = canvas.toDataURL('image/webp', quality);
      }
      if (result.length > 350_000) throw new Error('A imagem continua demasiado grande após compressão.');
      return result;
    } finally {
      URL.revokeObjectURL(source);
    }
  }
