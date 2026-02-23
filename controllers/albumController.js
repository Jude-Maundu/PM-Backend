router.post(
  '/bulk-upload',
  uploadMedia.array('files', 10), // allow up to 10 files
  async (req, res) => {
    try {
      const uploadedMedia = req.files.map(file => ({
        title: file.originalname,
        fileUrl: file.path,
        mediaType: file.mimetype.startsWith('video') ? 'video' : 'photo',
        photographer: req.body.photographer,
        album: req.body.album || null
      }));

      const media = await Media.insertMany(uploadedMedia);
      res.status(201).json(media);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);
