const positivePrice = (value) => {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
};

const CONFIGURED_DHARAMSHALA_PRICES = {
  ac: 1200,
  nonAc: 800,
  hall: 3000,
};

const configuredPriceForRoom = (room) => {
  const name = String(room?.name || "").toLowerCase();
  if (name.includes("hall")) return CONFIGURED_DHARAMSHALA_PRICES.hall;
  if (name.includes("non-ac") || name.includes("non ac")) return CONFIGURED_DHARAMSHALA_PRICES.nonAc;
  if (name.includes("ac")) return CONFIGURED_DHARAMSHALA_PRICES.ac;
  return null;
};

const getDharamshalaPrice = (room) => {
  const source = room?.toObject ? room.toObject() : room;
  return positivePrice(source?.pricePerNight)
    || configuredPriceForRoom(source);
};

const serializeDharamshala = (dharamshala) => {
  const serialized = dharamshala?.toObject ? dharamshala.toObject() : { ...dharamshala };
  serialized.roomTypes = (serialized.roomTypes || []).map((room) => {
    const { memberPricePerNight, nonMemberPricePerNight, ...roomData } = room;
    return { ...roomData, pricePerNight: getDharamshalaPrice(room) };
  });
  return serialized;
};

module.exports = { getDharamshalaPrice, serializeDharamshala };
