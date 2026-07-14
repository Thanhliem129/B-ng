package com.bong.pet.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.bong.pet.Prefs
import com.bong.pet.R
import com.bong.pet.api.ApiClient
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Onboarding Phase 0: đặt tên → xưng hô → xin quyền notification →
 * whitelist battery (bước sống còn trên máy Xiaomi/Oppo/Vivo) → đăng ký server.
 */
class OnboardingActivity : ComponentActivity() {

    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { finishOnboarding() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = Prefs(this)
        if (prefs.onboarded) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }

        setContent {
            MaterialTheme {
                var petName by remember { mutableStateOf("Bông") }
                var pronoun by remember { mutableStateOf("bà") }

                Column(
                    modifier = Modifier.fillMaxSize().padding(28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Image(
                        painter = painterResource(R.drawable.avatar_happy),
                        contentDescription = null,
                        modifier = Modifier.size(140.dp),
                    )
                    Spacer(Modifier.height(20.dp))
                    Text(
                        "chào. tui chưa có tên.\nđặt cho tui một cái đi",
                        style = MaterialTheme.typography.titleMedium,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(20.dp))
                    OutlinedTextField(
                        value = petName,
                        onValueChange = { if (it.length <= 20) petName = it },
                        label = { Text("Tên pet") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(16.dp))
                    Text("tui gọi bằng gì đây", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        FilterChip(selected = pronoun == "bà", onClick = { pronoun = "bà" }, label = { Text("bà") })
                        FilterChip(selected = pronoun == "ông", onClick = { pronoun = "ông" }, label = { Text("ông") })
                    }
                    Spacer(Modifier.height(28.dp))
                    Button(
                        onClick = {
                            prefs.petName = petName.trim().ifEmpty { "Bông" }
                            prefs.pronoun = pronoun
                            requestNotificationPermission()
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("cho tui quyền nhắn tin cho $pronoun nha")
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "hông thôi tui nhắn vào hư không đó",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            finishOnboarding()
        }
    }

    /** Bước sống còn: xin miễn battery optimization để OEM không giết FCM/notification. */
    private fun requestBatteryWhitelist() {
        val pm = getSystemService(PowerManager::class.java)
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            try {
                startActivity(
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                        .setData(Uri.parse("package:$packageName")),
                )
            } catch (_: Exception) {
                // một số OEM chặn intent này — Phase 1 sẽ có hướng dẫn theo từng hãng
            }
        }
    }

    private fun finishOnboarding() {
        requestBatteryWhitelist()
        val prefs = Prefs(this)
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token -> ApiClient.register(this, token) }
            .addOnFailureListener { ApiClient.register(this, null) }
        prefs.onboarded = true
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
