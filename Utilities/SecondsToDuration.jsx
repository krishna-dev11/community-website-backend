exports.convertSecondsToDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
  
    const duration = []
    if (hrs > 0) duration.push(`${hrs}h`)
    if (mins > 0) duration.push(`${mins}m`)
    if (hrs === 0 && mins === 0) duration.push(`${secs}s`)
  
    return duration.join(" ")
  }
  