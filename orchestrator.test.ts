// orchestrator.test.ts
import { loadAllToolSchemas } from './orchestrator';
import * as fs from 'fs/promises';

// Mock fs/promises module
jest.mock('fs/promises');

// Cast the mocked fs to have mock functions
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('loadAllToolSchemas', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.resetAllMocks();
    // Also reset console spies if we're spying on console
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should load and parse valid schema files', async () => {
    // Mock readdir to return schema files
    mockedFs.readdir.mockResolvedValue([
      'test1.tool_schema.json',
      'test2.tool_schema.json',
      'other.txt'
    ] as unknown as fs.Dirent[]);

    // Mock readFile to return different valid JSON schemas
    mockedFs.readFile.mockImplementationOnce(() => 
      Promise.resolve(JSON.stringify({
        name: 'test1',
        description: 'Test schema 1',
        input_schema: { type: 'object' },
        hints: { destructive: false }
      }))
    );

    mockedFs.readFile.mockImplementationOnce(() => 
      Promise.resolve(JSON.stringify({
        name: 'test2',
        description: 'Test schema 2',
        input_schema: { type: 'object' },
        hints: { destructive: true }
      }))
    );

    // Call the function
    const result = await loadAllToolSchemas('./dummy_path');

    // Assertions
    expect(mockedFs.readdir).toHaveBeenCalledWith('./dummy_path');
    expect(mockedFs.readFile).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(2);
    expect(result.has('test1')).toBe(true);
    expect(result.has('test2')).toBe(true);
    expect(result.get('test1')?.description).toBe('Test schema 1');
    expect(result.get('test2')?.hints?.destructive).toBe(true);
  });

  it('should return an empty map for an empty directory', async () => {
    // Mock readdir to return empty array
    mockedFs.readdir.mockResolvedValue([] as unknown as fs.Dirent[]);

    // Call the function
    const result = await loadAllToolSchemas('./dummy_path');

    // Assertions
    expect(mockedFs.readdir).toHaveBeenCalledWith('./dummy_path');
    expect(mockedFs.readFile).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it('should skip schema files missing a name property', async () => {
    // Mock readdir to return a schema file
    mockedFs.readdir.mockResolvedValue([
      'noname.tool_schema.json'
    ] as unknown as fs.Dirent[]);

    // Mock readFile to return a schema without name
    mockedFs.readFile.mockResolvedValue(JSON.stringify({
      description: 'Schema without name',
      input_schema: { type: 'object' }
    }));

    // Call the function
    const result = await loadAllToolSchemas('./dummy_path');

    // Assertions
    expect(mockedFs.readdir).toHaveBeenCalledWith('./dummy_path');
    expect(mockedFs.readFile).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('does not contain a name property')
    );
  });

  it('should skip schema files with invalid JSON', async () => {
    // Mock readdir to return a schema file
    mockedFs.readdir.mockResolvedValue([
      'invalid.tool_schema.json'
    ] as unknown as fs.Dirent[]);

    // Mock readFile to return invalid JSON
    mockedFs.readFile.mockResolvedValue('{ this is not valid JSON }');

    // Call the function
    const result = await loadAllToolSchemas('./dummy_path');

    // Assertions
    expect(mockedFs.readdir).toHaveBeenCalledWith('./dummy_path');
    expect(mockedFs.readFile).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error loading schema file'),
      expect.anything()
    );
  });
});
