
import fs from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import process from 'node:process';

export class BlobService {
  private static instance: BlobService;
  private blobServiceClient: BlobServiceClient | undefined;
  private containerClient: ContainerClient | undefined;
  private isInitialized = false;
  private useLocalFallback = false;

  public static async getInstance(): Promise<BlobService> {
    if (!BlobService.instance) {
      const instance = new BlobService();
      await instance.initialize();
      BlobService.instance = instance;
    }

    return BlobService.instance;
  }

  protected async initialize(): Promise<void> {
    try {
      const storageUrl = process.env.AZURE_STORAGE_URL;
      const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'blobs';

      if (!storageUrl) {
        console.warn('Azure Storage URL not found in environment variables. Using local filesystem fallback.');
        this.useLocalFallback = true;
        return;
      }

      const credential = new DefaultAzureCredential();

      this.blobServiceClient = new BlobServiceClient(storageUrl, credential);
      this.containerClient = this.blobServiceClient.getContainerClient(containerName);

      const exists = await this.containerClient.exists();
      if (!exists) {
        console.warn(`Container '${containerName}' does not exist.`);
        return;
      }

      this.isInitialized = true;
      console.log('Successfully connected to Azure Blob Storage');

      await this.ensureImagesUploaded();
    } catch (error) {
      console.error('Failed to initialize Azure Blob Storage:', error);
      this.useLocalFallback = true;
    }
  }

  private async ensureImagesUploaded(): Promise<void> {
    if (!this.isInitialized || !this.containerClient) {
      return;
    }

    try {
      const firstImageName = 'burger-pic-1.jpg';
      const blobClient = this.containerClient.getBlobClient(firstImageName);
      const imageExists = await blobClient.exists();

      if (imageExists) {
        console.log('Images already exist in blob storage');
      } else {
        console.log('First image not found in blob storage. Uploading all images...');
        await this.uploadAllImages();
      }
    } catch (error) {
      console.error('Error checking image existence:', error);
    }
  }

  private async uploadAllImages(): Promise<void> {
    if (!this.isInitialized || !this.containerClient) {
      return;
    }

    try {
      let imagesDirectory = await this.findDataDirectory();
      
      if (!imagesDirectory) {
          console.warn('Could not find data/images directory. Skipping upload.');
          return;
      }

      const allFiles = await fs.readdir(imagesDirectory);
      const imageFiles = allFiles.filter((file) => file.endsWith('.jpg'));

      console.log(`Found ${imageFiles.length} images to upload`);

      const { containerClient } = this;
      const uploadPromises = imageFiles.map(async (imageFile) => {
        const filePath = path.join(imagesDirectory!, imageFile);
        const fileContent = await fs.readFile(filePath);

        const blockBlobClient = containerClient.getBlockBlobClient(imageFile);

        await blockBlobClient.upload(fileContent, fileContent.length, {
          blobHTTPHeaders: {
            blobContentType: 'image/jpeg',
          },
        });

        console.log(`Uploaded ${imageFile}`);
        return imageFile;
      });

      await Promise.all(uploadPromises);
      console.log('All images uploaded successfully');
    } catch (error) {
      console.error('Error uploading images:', error);
    }
  }

  public async getBlob(blobName: string): Promise<Buffer | undefined> {
    if (this.useLocalFallback) {
      return this.getLocalFile(blobName);
    }

    if (!this.isInitialized || !this.containerClient) {
      console.warn('Blob Service not initialized, trying local fallback');
      return this.getLocalFile(blobName);
    }

    try {
      const blobClient = this.containerClient.getBlobClient(blobName);

      const exists = await blobClient.exists();
      if (!exists) {
        console.warn(`Blob '${blobName}' does not exist in cloud, checking local.`);
        return this.getLocalFile(blobName);
      }

      const downloadResponse = await blobClient.download();

      if (!downloadResponse.readableStreamBody) {
        return undefined;
      }

      return await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = downloadResponse.readableStreamBody!;

        stream.on('data', (data) => {
          chunks.push(Buffer.from(data));
        });

        stream.on('end', () => {
          resolve(Buffer.concat(chunks));
        });

        stream.on('error', reject);
      });
    } catch (error) {
      console.error(`Error retrieving blob '${blobName}':`, error);
      return undefined;
    }
  }

  private async pathExists(path: string) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
  
  private async findDataDirectory(): Promise<string | undefined> {
      // Candidates for where images might be stored
      const candidates = [
          // 1. Production: Standard Azure Functions wwwroot/dist location
          path.join(process.cwd(), 'dist', 'data', 'images'),
          // 2. Production: Fallback if cwd is wwwroot
          path.join(process.cwd(), 'data', 'images'),
          // 3. Local Development
          path.join(__dirname, '..', '..', 'data', 'images'),
          // 4. Local Development (Alternative)
          path.join(__dirname, '..', 'data', 'images'),
          // 5. Explicit Environment path if set
          process.env.HOME ? path.join(process.env.HOME, 'site', 'wwwroot', 'dist', 'data', 'images') : ''
      ];
      
      for (const dir of candidates) {
          if (dir && await this.pathExists(dir)) {
              console.log(`[BlobService] Found image directory at: ${dir}`);
              return dir;
          }
      }
      
      console.warn('[BlobService] Could not find image directory in any candidate path.');
      return undefined;
  }

  private async getLocalFile(fileName: string): Promise<Buffer | undefined> {
    try {
      const imagesDir = await this.findDataDirectory();
      if (!imagesDir) {
          console.warn(`Could not locate local images directory for ${fileName}`);
          return undefined;
      }
      
      const filePath = path.join(imagesDir, fileName);
      
      if (!(await this.pathExists(filePath))) {
        console.warn(`Local file '${fileName}' not found at path: ${filePath}`);
        return undefined;
      }

      const fileContent = await fs.readFile(filePath);
      return fileContent;
    } catch (error) {
      console.error(`Error reading local file '${fileName}':`, error);
      return undefined;
    }
  }

  public getContentType(blobName: string): string {
    const extension = blobName.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'jpg':
      case 'jpeg': {
        return 'image/jpeg';
      }

      case 'png': {
        return 'image/png';
      }

      case 'gif': {
        return 'image/gif';
      }

      case 'webp': {
        return 'image/webp';
      }

      case 'svg': {
        return 'image/svg+xml';
      }

      default: {
        return 'application/octet-stream';
      }
    }
  }
}