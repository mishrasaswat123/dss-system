with open('/home/ubuntu/dss-system/server.js', 'r') as f:
    content = f.read()

old = '''                        return res.json({
                          status: "OK",
                          timestamp: Date.now(),
                          dataStatus: "live",
                          data: brain
                        });
                  } catch (err) {
                        logger.error({
                          error: err.message,
                          stack: err.stack
                        }, "BRAIN_API_ERROR");'''

new = '''                        return res.json({
                          status: "OK",
                          timestamp: Date.now(),
                          dataStatus: "live",
                          data: {
                            ...brain,
                            compositeScore,
                            regime,
                            confidence,
                            marketQuality
                          }
                        });
                  } catch (err) {
                        logger.error({
                          error: err.message,
                          stack: err.stack
                        }, "BRAIN_API_ERROR");'''

if old in content:
    content = content.replace(old, new)
    with open('/home/ubuntu/dss-system/server.js', 'w') as f:
        f.write(content)
    print("PATCH OK")
else:
    print("PATCH FAILED - string not found")
