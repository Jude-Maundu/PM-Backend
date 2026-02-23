router.get('/search', async (req, res) => {
  const { title, mediaType, photographer, minPrice, maxPrice } = req.query;
  const query = {};

  if (title) query.title = { $regex: title, $options: 'i' };
  if (mediaType) query.mediaType = mediaType;
  if (photographer) query.photographer = photographer;
  if (minPrice) query.price = { ...query.price, $gte: minPrice };
  if (maxPrice) query.price = { ...query.price, $lte: maxPrice };

  const media = await Media.find(query).populate('photographer', 'username');
  res.json(media);
});
