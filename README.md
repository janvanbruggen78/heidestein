Heidestein

ReactNative location tracking for minimal distractions while hiking

//short cuts
./gradlew  assembleRelease   

adb -s adb-VGPBNVSKYHSS59VO-Aqz8X7._adb-tls-connect._tcp install -r app/build/outputs/apk/release/app-release.apk

adb -s adb-VGPBNVSKYHSS59VO-Aqz8X7._adb-tls-connect._tcp logcat | grep -E "\[BG\]|\[DBG\]|ReactNativeJS"    

//logging

Start logging on device (background)
adb -s adb-VGPBNVSKYHSS59VO-Aqz8X7._adb-tls-connect._tcp shell "nohup logcat -v time > /sdcard/Documents/walk.log 2>&1 &"

Check if logcat is still running
adb -s adb-VGPBNVSKYHSS59VO-Aqz8X7._adb-tls-connect._tcp shell "ps | grep logcat"

Stop logging (kill logcat)
adb -s adb-VGPBNVSKYHSS59VO-Aqz8X7._adb-tls-connect._tcp shell "killall logcat"

Pull log file to computer
adb -s adb-VGPBNVSKYHSS59VO-Aqz8X7._adb-tls-connect._tcp pull /sdcard/Documents/walk.log .

Filter pulled log (on Mac)
grep -E "\[BG\]|\[DBG\]|ReactNativeJS" walk.log > walk.filtered.log

View last 100 lines of filtered log
tail -n 100 walk.filtered.log

Remove log from device
adb -s adb-VGPBNVSKYHSS59VO-Aqz8X7._adb-tls-connect._tcp shell "rm /sdcard/Documents/walk.log"
