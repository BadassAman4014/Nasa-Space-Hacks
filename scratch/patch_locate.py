p = "src/components/fields/FieldExplorerView.tsx"
s = open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in s
s = s.replace("\r\n", "\n")


def rep(a, b):
    global s
    assert a in s, a[:70]
    s = s.replace(a, b, 1)


a = s.index("  // Fetch exact GPS location and load fields near the user")
b = s.index("  // Re-fetch when nearby radius changes")
new = """  // Locate the user and load fields near them.
  // Desktop browsers have no GPS: they estimate position from Wi-Fi/IP, which can be tens of km off.
  // So: try high accuracy first, fall back to a network fix on timeout, and tell the user how precise the fix is.
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      onNotify('Geolocation is not supported by your browser. Search your postal code instead.');
      return;
    }

    setLocating(true);
    onNotify('Requesting your location...');

    const onFix = async (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;

      setUserLocation({ lat, lon, accuracy });
      setTargetFly({ lat, lon, zoom: accuracy > 5000 ? 11 : 14.5 });
      setLocating(false);

      const km = (accuracy / 1000).toFixed(accuracy >= 10000 ? 0 : 1);
      const approx = accuracy > 5000;
      setLoading(true);
      try {
        const res = await boundariesApi.getNearbyBoundaries({
          lat,
          lon,
          radius: nearbyRadius,
          limit: 1000,
          land_use_category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        });

        if (res.features && res.features.length > 0) {
          setBoundaries(res.features);
          setCoverage(res.properties ?? null);
          onNotify(
            approx
              ? `Approximate location (about ${km} km accuracy). Found ${res.features.length} field blocks nearby. If this is not where you are, search your postal code.`
              : `Located! Found ${res.features.length} field blocks within ${(nearbyRadius / 1000).toFixed(1)} km of your position.`
          );
        } else {
          setBoundaries([]);
          setCoverage(null);
          if (!isWithinBrandenburg(lat, lon)) {
            onNotify(
              `Your browser places you at ${lat.toFixed(3)}, ${lon.toFixed(3)} (about ${km} km accuracy), outside Brandenburg. If that is wrong, search your postal code.`
            );
          } else {
            onNotify(`No agricultural blocks within ${(nearbyRadius / 1000).toFixed(1)} km. Try expanding radius.`);
          }
        }
      } catch (err) {
        onNotify(`Located you at ${lat.toFixed(4)}, ${lon.toFixed(4)}, but the field boundary lookup failed. Please try again.`);
      } finally {
        setLoading(false);
      }
    };

    const onFail = (err: GeolocationPositionError) => {
      setLocating(false);
      if (err.code === err.PERMISSION_DENIED) {
        onNotify('Location permission is blocked. Allow location for this site in your browser settings, or search your postal code.');
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        onNotify('Your device could not determine a location (check that your system location services are on). Search your postal code instead.');
      } else if (err.code === err.TIMEOUT) {
        onNotify('Location request timed out. Please try again, or search your postal code.');
      } else {
        onNotify(`Could not fetch location: ${err.message}`);
      }
    };

    navigator.geolocation.getCurrentPosition(
      onFix,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) return onFail(err);
        // Retry with a network-based fix (no GPS needed, accepts a recent cached position).
        navigator.geolocation.getCurrentPosition(onFix, onFail, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 5 * 60 * 1000,
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

"""
s = s[:a] + new + s[b:]

rep(
    """                  <p className="text-xs text-[#9cb3a8] mt-1 leading-relaxed">
                    Official DFBK agricultural boundaries are currently available only in Brandenburg, Germany. You can use AI-powered satellite image analysis to detect potential agricultural field boundaries in this location.
                  </p>""",
    """                  <p className="text-xs text-[#9cb3a8] mt-1 leading-relaxed">
                    {userLocation
                      ? `Your browser reports your location as ${userLocation.lat.toFixed(3)}, ${userLocation.lon.toFixed(3)}${
                          userLocation.accuracy
                            ? ` (accuracy about ${(userLocation.accuracy / 1000).toFixed(userLocation.accuracy >= 10000 ? 0 : 1)} km)`
                            : ''
                        }, which is outside Brandenburg. Desktop browsers estimate position from Wi-Fi or IP and can be far off. Search your postal code or use a Jump button to go to the right place. `
                      : 'Official DFBK agricultural boundaries are currently available only in Brandenburg, Germany. '}
                    You can use AI-powered satellite image analysis to detect potential agricultural field boundaries in this location.
                  </p>""",
)
open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n") if crlf else s)
print("ok")
