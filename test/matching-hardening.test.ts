import { describe, expect, it } from 'vitest';
import { selectMediaFile } from '../src/resolver/file-selector.js';
import { matchesRequestedContent } from '../src/resolver/content-match.js';
import { FileManifest } from '../src/types.js';

describe('Hardened Season/Episode, Music, and Content Matching', () => {

  describe('Strict Season + Episode Selection', () => {
    it('strictly enforces season matching and refuses to pick an episode from another season', () => {
      const files: FileManifest[] = [
        { index: 0, path: 'Show.S01E04.1080p.mkv', name: 'Show.S01E04.1080p.mkv', size: 1000, mimeType: 'video/x-matroska', offset: 0, selected: false },
        { index: 1, path: 'Show.S02E05.1080p.mkv', name: 'Show.S02E05.1080p.mkv', size: 1000, mimeType: 'video/x-matroska', offset: 1000, selected: false },
        { index: 2, path: 'Show.S02E06.1080p.mkv', name: 'Show.S02E06.1080p.mkv', size: 1000, mimeType: 'video/x-matroska', offset: 2000, selected: false }
      ];

      // Requested: Season 1 Episode 5
      // The torrent has S02E05, but S01E05 is missing!
      const selected = selectMediaFile(files, { title: 'Show', season: 1, episode: 5, type: 'series' });
      // Must NOT select S02E05!
      expect(selected).toBeUndefined();
    });

    it('matches S01E05 correctly when available', () => {
      const files: FileManifest[] = [
        { index: 0, path: 'Show.S01E04.1080p.mkv', name: 'Show.S01E04.1080p.mkv', size: 1000, mimeType: 'video/x-matroska', offset: 0, selected: false },
        { index: 1, path: 'Show.S01E05.1080p.mkv', name: 'Show.S01E05.1080p.mkv', size: 1000, mimeType: 'video/x-matroska', offset: 1000, selected: false },
        { index: 2, path: 'Show.S02E05.1080p.mkv', name: 'Show.S02E05.1080p.mkv', size: 1000, mimeType: 'video/x-matroska', offset: 2000, selected: false }
      ];

      const selected = selectMediaFile(files, { title: 'Show', season: 1, episode: 5, type: 'series' });
      expect(selected?.name).toBe('Show.S01E05.1080p.mkv');
      expect(selected?.index).toBe(1);
    });

    it('prevents partial match of Episode 5 inside Episode 50', () => {
      const files: FileManifest[] = [
        { index: 0, path: 'Show.S01E50.1080p.mkv', name: 'Show.S01E50.1080p.mkv', size: 1000, mimeType: 'video/x-matroska', offset: 0, selected: false }
      ];

      const selected = selectMediaFile(files, { title: 'Show', season: 1, episode: 5, type: 'series' });
      expect(selected).toBeUndefined();

      const epOnlySelected = selectMediaFile(files, { title: 'Show', episode: 5 });
      expect(epOnlySelected).toBeUndefined();
    });

    it('matches 1x05 and Season 1 Episode 5 formats', () => {
      const filesA: FileManifest[] = [
        { index: 0, path: 'Show.1x05.1080p.mkv', name: 'Show.1x05.1080p.mkv', size: 1000, mimeType: 'video/x-matroska', offset: 0, selected: false }
      ];
      expect(selectMediaFile(filesA, { title: 'Show', season: 1, episode: 5 })?.name).toBe('Show.1x05.1080p.mkv');

      const filesB: FileManifest[] = [
        { index: 0, path: 'Show Season 1 Episode 5.mkv', name: 'Show Season 1 Episode 5.mkv', size: 1000, mimeType: 'video/x-matroska', offset: 0, selected: false }
      ];
      expect(selectMediaFile(filesB, { title: 'Show', season: 1, episode: 5 })?.name).toBe('Show Season 1 Episode 5.mkv');
    });
  });

  describe('Music / Audio Matching', () => {
    it('prioritizes Artist + Album + specific Track without picking wrong track', () => {
      const files: FileManifest[] = [
        { index: 0, path: 'Album/01 - Intro.mp3', name: '01 - Intro.mp3', size: 3000, mimeType: 'audio/mpeg', offset: 0, selected: false },
        { index: 1, path: 'Album/10 - Target Track.flac', name: '10 - Target Track.flac', size: 25000, mimeType: 'audio/flac', offset: 3000, selected: false },
        { index: 2, path: 'Album/01 - First Song.flac', name: '01 - First Song.flac', size: 22000, mimeType: 'audio/flac', offset: 28000, selected: false }
      ];

      // Request track 10
      const track10 = selectMediaFile(files, { type: 'music', artist: 'Artist', album: 'Album', track: '10' });
      expect(track10?.name).toBe('10 - Target Track.flac');

      // Request track 1 (must NOT pick track 10)
      const track1 = selectMediaFile(files, { type: 'music', artist: 'Artist', album: 'Album', track: '1' });
      expect(track1?.name).toBe('01 - First Song.flac'); // FLAC higher rank than MP3
    });

    it('prefers lossless FLAC over MP3 and AAC when full album is requested', () => {
      const files: FileManifest[] = [
        { index: 0, path: 'song.mp3', name: 'song.mp3', size: 5000, mimeType: 'audio/mpeg', offset: 0, selected: false },
        { index: 1, path: 'song.aac', name: 'song.aac', size: 4000, mimeType: 'audio/aac', offset: 5000, selected: false },
        { index: 2, path: 'song.flac', name: 'song.flac', size: 25000, mimeType: 'audio/flac', offset: 9000, selected: false }
      ];

      const selected = selectMediaFile(files, { type: 'music', title: 'song' });
      expect(selected?.name).toBe('song.flac');
    });
  });

  describe('Content Matching False-Positive Prevention', () => {
    it('prevents matching sequel titles when original title is requested', () => {
      // Searching for "Spider-Man" should not match "Spider-Man 2"
      const matchSequel = matchesRequestedContent(
        { title: 'Spider-Man', type: 'movie' },
        'Spider-Man 2 2004 1080p BluRay'
      );
      expect(matchSequel).toBe(false);

      // Searching for "Iron Man" should not match "Iron Man 3"
      const matchIronMan = matchesRequestedContent(
        { title: 'Iron Man', type: 'movie' },
        'Iron Man 3 2013 1080p'
      );
      expect(matchIronMan).toBe(false);

      // Exact match for Spider-Man 2 works
      const matchExactSequel = matchesRequestedContent(
        { title: 'Spider-Man 2', type: 'movie' },
        'Spider-Man 2 2004 1080p BluRay'
      );
      expect(matchExactSequel).toBe(true);
    });

    it('matches titles with articles like The Batman', () => {
      expect(matchesRequestedContent({ title: 'The Batman', type: 'movie' }, 'The Batman 2022 1080p')).toBe(true);
      expect(matchesRequestedContent({ title: 'Batman', type: 'movie' }, 'Batman 1989 1080p')).toBe(true);
    });
  });
});
